import { google } from 'googleapis';
import fs from 'fs/promises';
import path from 'path';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import AdmZip from 'adm-zip';
import os from 'os';

interface DownloadProgress {
  bytesDownloaded: number;
  totalBytes: number;
  percentage: number;
  status: 'downloading' | 'complete' | 'error';
}

interface GoogleDriveFile {
  id: string;
  name: string;
  mimeType: string;
  size: string;
  fileExtension?: string;
  webViewLink?: string;
}

// Maximum file size (500MB)
const MAX_FILE_SIZE = 500 * 1024 * 1024;

// Supported MIME types
const SUPPORTED_MIME_TYPES = [
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/pdf',
  'application/zip',
  'application/x-zip-compressed',
];

class GoogleDriveService {
  private connectionSettings: any = null;

  /**
   * Get access token for Google Drive API
   */
  private async getAccessToken(): Promise<string> {
    if (this.connectionSettings?.settings?.expires_at && 
        new Date(this.connectionSettings.settings.expires_at).getTime() > Date.now()) {
      return this.connectionSettings.settings.access_token;
    }
    
    const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
    const xReplitToken = process.env.REPL_IDENTITY 
      ? 'repl ' + process.env.REPL_IDENTITY 
      : process.env.WEB_REPL_RENEWAL 
      ? 'depl ' + process.env.WEB_REPL_RENEWAL 
      : null;

    if (!xReplitToken) {
      throw new Error('X_REPLIT_TOKEN not found for repl/depl');
    }

    this.connectionSettings = await fetch(
      'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=google-drive',
      {
        headers: {
          'Accept': 'application/json',
          'X_REPLIT_TOKEN': xReplitToken
        }
      }
    ).then(res => res.json()).then(data => data.items?.[0]);

    const accessToken = this.connectionSettings?.settings?.access_token || 
                       this.connectionSettings.settings?.oauth?.credentials?.access_token;

    if (!this.connectionSettings || !accessToken) {
      throw new Error('Google Drive not connected. Please connect Google Drive from the integrations panel.');
    }
    
    return accessToken;
  }

  /**
   * Get uncachable Google Drive client
   * WARNING: Never cache this client as access tokens expire
   */
  private async getGoogleDriveClient() {
    const accessToken = await this.getAccessToken();

    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({
      access_token: accessToken
    });

    return google.drive({ version: 'v3', auth: oauth2Client });
  }

  /**
   * Extract file ID from various Google Drive URL formats
   */
  extractFileId(urlOrId: string): string | null {
    // If it's already just an ID (no slashes or URL parts)
    if (!urlOrId.includes('/') && !urlOrId.includes('\\')) {
      return urlOrId;
    }

    // Try different URL patterns
    const patterns = [
      /\/file\/d\/([a-zA-Z0-9-_]+)/,  // https://drive.google.com/file/d/FILE_ID/view
      /\/open\?id=([a-zA-Z0-9-_]+)/,   // https://drive.google.com/open?id=FILE_ID
      /\/uc\?id=([a-zA-Z0-9-_]+)/,     // https://drive.google.com/uc?id=FILE_ID
      /^([a-zA-Z0-9-_]+)$/              // Just the ID
    ];

    for (const pattern of patterns) {
      const match = urlOrId.match(pattern);
      if (match) {
        return match[1];
      }
    }

    return null;
  }

  /**
   * Get file metadata from Google Drive
   */
  async getFileMetadata(fileId: string): Promise<GoogleDriveFile> {
    try {
      const drive = await this.getGoogleDriveClient();
      
      const response = await drive.files.get({
        fileId: fileId,
        fields: 'id,name,mimeType,size,fileExtension,webViewLink'
      });

      if (!response.data) {
        throw new Error('File not found');
      }

      return response.data as GoogleDriveFile;
    } catch (error: any) {
      if (error.code === 404) {
        throw new Error('File not found or not accessible');
      } else if (error.code === 403) {
        throw new Error('Permission denied. Make sure the file is shared with "Anyone with the link"');
      }
      throw error;
    }
  }

  /**
   * Download file from Google Drive with progress tracking
   */
  async downloadFile(
    fileId: string, 
    onProgress?: (progress: DownloadProgress) => void
  ): Promise<string> {
    try {
      const drive = await this.getGoogleDriveClient();
      
      // Get file metadata first
      const fileMetadata = await this.getFileMetadata(fileId);
      
      // Check file size
      const fileSize = parseInt(fileMetadata.size || '0', 10);
      if (fileSize > MAX_FILE_SIZE) {
        throw new Error(`File too large (${Math.round(fileSize / 1024 / 1024)}MB). Maximum allowed size is 500MB`);
      }

      // Check MIME type
      if (!SUPPORTED_MIME_TYPES.includes(fileMetadata.mimeType)) {
        // Check if it's a Google Sheets/Docs file that needs export
        if (fileMetadata.mimeType === 'application/vnd.google-apps.spreadsheet') {
          return await this.exportGoogleSheet(fileId, fileMetadata, onProgress);
        }
        throw new Error(`Unsupported file type: ${fileMetadata.mimeType}`);
      }

      // Create temporary directory if it doesn't exist
      const tmpDir = path.join(os.tmpdir(), 'google-drive-downloads');
      await fs.mkdir(tmpDir, { recursive: true });

      // Generate temporary file path
      const fileExtension = fileMetadata.fileExtension || this.getExtensionFromMimeType(fileMetadata.mimeType);
      const fileName = `${Date.now()}_${fileMetadata.name || 'download'}${fileExtension ? '.' + fileExtension : ''}`;
      const filePath = path.join(tmpDir, fileName);

      // Download the file
      const response = await drive.files.get(
        {
          fileId: fileId,
          alt: 'media'
        },
        {
          responseType: 'stream'
        }
      );

      // Track download progress
      let bytesDownloaded = 0;
      const totalBytes = fileSize;

      if (onProgress) {
        response.data.on('data', (chunk: Buffer) => {
          bytesDownloaded += chunk.length;
          onProgress({
            bytesDownloaded,
            totalBytes,
            percentage: totalBytes > 0 ? Math.round((bytesDownloaded / totalBytes) * 100) : 0,
            status: 'downloading'
          });
        });
      }

      // Write to file
      const writeStream = createWriteStream(filePath);
      await pipeline(response.data, writeStream);

      if (onProgress) {
        onProgress({
          bytesDownloaded: totalBytes,
          totalBytes,
          percentage: 100,
          status: 'complete'
        });
      }

      // If it's a zip file, extract it
      if (fileMetadata.mimeType === 'application/zip' || 
          fileMetadata.mimeType === 'application/x-zip-compressed' ||
          filePath.endsWith('.zip')) {
        return await this.extractZipFile(filePath);
      }

      return filePath;
    } catch (error: any) {
      if (onProgress) {
        onProgress({
          bytesDownloaded: 0,
          totalBytes: 0,
          percentage: 0,
          status: 'error'
        });
      }
      
      // Enhance error messages
      if (error.message?.includes('Invalid Credentials')) {
        throw new Error('Google Drive authentication failed. Please reconnect Google Drive.');
      } else if (error.message?.includes('User Rate Limit Exceeded')) {
        throw new Error('Google Drive API rate limit exceeded. Please try again in a few minutes.');
      }
      
      throw error;
    }
  }

  /**
   * Export Google Sheets file as Excel
   */
  private async exportGoogleSheet(
    fileId: string, 
    fileMetadata: GoogleDriveFile,
    onProgress?: (progress: DownloadProgress) => void
  ): Promise<string> {
    const drive = await this.getGoogleDriveClient();
    
    // Create temporary directory
    const tmpDir = path.join(os.tmpdir(), 'google-drive-downloads');
    await fs.mkdir(tmpDir, { recursive: true });

    const fileName = `${Date.now()}_${fileMetadata.name || 'spreadsheet'}.xlsx`;
    const filePath = path.join(tmpDir, fileName);

    // Export as Excel
    const response = await drive.files.export(
      {
        fileId: fileId,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      },
      {
        responseType: 'stream'
      }
    );

    if (onProgress) {
      onProgress({
        bytesDownloaded: 0,
        totalBytes: 0,
        percentage: 50,
        status: 'downloading'
      });
    }

    const writeStream = createWriteStream(filePath);
    await pipeline(response.data, writeStream);

    if (onProgress) {
      onProgress({
        bytesDownloaded: 0,
        totalBytes: 0,
        percentage: 100,
        status: 'complete'
      });
    }

    return filePath;
  }

  /**
   * Extract ZIP file and return the path to the first CSV/Excel file found
   */
  private async extractZipFile(zipPath: string): Promise<string> {
    const zip = new AdmZip(zipPath);
    const extractDir = path.join(path.dirname(zipPath), `extracted_${Date.now()}`);
    
    zip.extractAllTo(extractDir, true);

    // Find the first CSV or Excel file in the extracted contents
    const files = await this.findDataFiles(extractDir);
    
    if (files.length === 0) {
      throw new Error('No CSV or Excel files found in the ZIP archive');
    }

    // Clean up the original zip file
    await fs.unlink(zipPath);

    return files[0];
  }

  /**
   * Recursively find CSV and Excel files in a directory
   */
  private async findDataFiles(dir: string): Promise<string[]> {
    const dataFiles: string[] = [];
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        // Recursively search subdirectories
        const subFiles = await this.findDataFiles(fullPath);
        dataFiles.push(...subFiles);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (['.csv', '.xlsx', '.xls'].includes(ext)) {
          dataFiles.push(fullPath);
        }
      }
    }

    return dataFiles;
  }

  /**
   * Get file extension from MIME type
   */
  private getExtensionFromMimeType(mimeType: string): string {
    const mimeToExt: Record<string, string> = {
      'text/csv': 'csv',
      'application/vnd.ms-excel': 'xls',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
      'application/pdf': 'pdf',
      'application/zip': 'zip',
      'application/x-zip-compressed': 'zip'
    };

    return mimeToExt[mimeType] || '';
  }

  /**
   * Clean up temporary files
   */
  async cleanupTempFile(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
      
      // Also clean up extracted directory if it exists
      const dir = path.dirname(filePath);
      if (dir.includes('extracted_')) {
        await fs.rm(dir, { recursive: true, force: true });
      }
    } catch (error) {
      console.error('Failed to clean up temporary file:', error);
    }
  }

  /**
   * Validate Google Drive connection
   */
  async validateConnection(): Promise<boolean> {
    try {
      const drive = await this.getGoogleDriveClient();
      // Try to list files (with limit 1) to verify connection
      await drive.files.list({ pageSize: 1 });
      return true;
    } catch (error) {
      console.error('Google Drive connection validation failed:', error);
      return false;
    }
  }
}

export const googleDriveService = new GoogleDriveService();