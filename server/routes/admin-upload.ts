import { Express, Request, Response } from "express";
import multer from "multer";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { s3Client, isObjectStorageConfigured } from "../object-storage.js";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { UnifiedUploadHandler } from "../services/unified-upload-handler";
import { storage } from "../storage";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

// Configure multer for file uploads
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit
  }
});

// Middleware to check authentication
function requireAuth(req: any, res: any, next: any) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  req.user = { id: req.session.userId, role: req.session.userRole };
  next();
}

// Middleware to check admin role
function requireAdmin(req: any, res: any, next: any) {
  if (req.session?.userRole !== 'admin') {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}

/**
 * Store file with fallback to local storage if S3 fails
 * @param file - The uploaded file buffer
 * @param filename - Original filename
 * @returns Object with storage location and type
 */
async function storeFileWithFallback(
  file: Buffer, 
  filename: string
): Promise<{ storageKey: string; storageType: 's3' | 'local'; filePath?: string }> {
  const timestamp = Date.now();
  const uniqueId = crypto.randomBytes(8).toString('hex');
  const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storageKey = `batches/${timestamp}_${uniqueId}_${safeFilename}`;
  
  // Try S3 storage first if configured
  if (isObjectStorageConfigured() && s3Client) {
    try {
      console.log(`[Upload] Attempting to store file in S3: ${storageKey}`);
      
      const command = new PutObjectCommand({
        Bucket: process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID!,
        Key: storageKey,
        Body: file,
        ContentType: filename.endsWith('.xlsx') ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'text/csv',
      });
      
      await s3Client.send(command);
      
      console.log(`[Upload] Successfully stored file in S3: ${storageKey}`);
      return { 
        storageKey, 
        storageType: 's3' 
      };
      
    } catch (s3Error: any) {
      console.error(`[Upload] S3 storage failed, falling back to local storage:`, {
        error: s3Error.message,
        code: s3Error.code,
        statusCode: s3Error.$metadata?.httpStatusCode
      });
      
      // Continue to local storage fallback
    }
  } else {
    console.log('[Upload] S3 not configured, using local storage');
  }
  
  // Fallback to local file storage
  try {
    const uploadsDir = path.join(process.cwd(), 'uploads', 'batches');
    await fs.mkdir(uploadsDir, { recursive: true });
    
    const localFilename = `${timestamp}_${uniqueId}_${safeFilename}`;
    const localPath = path.join(uploadsDir, localFilename);
    
    await fs.writeFile(localPath, file);
    
    console.log(`[Upload] File stored locally at: ${localPath}`);
    
    return { 
      storageKey: `local_${localFilename}`, 
      storageType: 'local',
      filePath: localPath
    };
    
  } catch (localError: any) {
    console.error('[Upload] Local storage also failed:', localError);
    throw new Error(`Failed to store file: Both S3 and local storage failed. ${localError.message}`);
  }
}

/**
 * Parse CSV or Numbers file
 */
async function parseCSVFile(buffer: Buffer, filename: string): Promise<{ rows: any[], headers: string[] }> {
  // Check if this might be an Apple Numbers file (ZIP-based)
  const firstBytes = buffer.slice(0, 8).toString('hex').toUpperCase();
  
  if (firstBytes.startsWith('504B0304')) {
    const isNumbers = filename.toLowerCase().endsWith('.numbers') || 
                     filename.toLowerCase().includes('numbers');
    
    if (isNumbers || filename.toLowerCase().endsWith('.csv')) {
      // Try to parse as Numbers file
      try {
        console.log('[parseCSVFile] Detected potential Numbers file, attempting to parse...');
        const { NumbersFileParser } = await import('../services/numbers-file-parser.js');
        const parser = new NumbersFileParser();
        const result = await parser.parseNumbersFile(buffer, filename);
        console.log(`[parseCSVFile] Successfully parsed Numbers file: ${result.rows.length} rows`);
        return result;
      } catch (numbersError: any) {
        console.error('[parseCSVFile] Numbers parsing failed:', numbersError.message);
        // If it fails and filename suggests CSV, throw appropriate error
        if (filename.toLowerCase().endsWith('.csv')) {
          throw new Error('This appears to be an Apple Numbers file renamed as CSV. Please export it as CSV from Numbers or upload the original .numbers file.');
        }
        throw numbersError;
      }
    }
    
    throw new Error('This appears to be a ZIP or compressed file. Please upload a CSV file, or if this is an Apple Numbers file, please include .numbers in the filename.');
  }
  
  // Parse as regular CSV
  return new Promise((resolve, reject) => {
    const text = buffer.toString('utf-8');
    
    Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false, // Keep everything as strings for consistent processing
      complete: (results) => {
        if (results.errors.length > 0) {
          console.warn('[CSV Parser] Parse warnings:', results.errors);
        }
        
        const headers = results.meta.fields || [];
        resolve({ 
          rows: results.data as any[], 
          headers 
        });
      },
      error: (error: any) => {
        reject(error);
      }
    });
  });
}

/**
 * Parse Excel file
 */
function parseExcelFile(buffer: Buffer, filename: string): { rows: any[], headers: string[] } {
  try {
    const workbook = XLSX.read(buffer, { 
      type: 'buffer',
      cellDates: true,
      raw: false
    });
    
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    
    // Convert to JSON
    const jsonData = XLSX.utils.sheet_to_json(worksheet, {
      header: 1, // Get array of arrays
      defval: '', // Default value for empty cells
      blankrows: false // Skip blank rows
    });
    
    if (!jsonData || jsonData.length === 0) {
      throw new Error('No data found in Excel file');
    }
    
    // First row is headers
    const headers = (jsonData[0] as any[]).map(h => String(h || '').trim());
    
    // Convert to array of objects
    const rows = [];
    for (let i = 1; i < jsonData.length; i++) {
      const row = jsonData[i] as any[];
      const obj: any = {};
      headers.forEach((header, index) => {
        obj[header] = row[index] || '';
      });
      rows.push(obj);
    }
    
    return { rows, headers };
  } catch (error: any) {
    throw new Error(`Failed to parse Excel file: ${error.message}`);
  }
}

export function setupAdminUploadRoutes(app: Express) {
  const uploadHandler = new UnifiedUploadHandler();

  /**
   * POST /api/admin/upload - Enhanced upload endpoint with fallback
   * Handles CSV and Excel files with intelligent processing
   */
  app.post("/api/admin/upload", requireAuth, requireAdmin, upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const file = req.file;
      const userId = req.user!.id;
      
      console.log(`[Admin Upload] Processing file: ${file.originalname} (${file.size} bytes)`);
      
      // Store the file with fallback mechanism
      const storageResult = await storeFileWithFallback(file.buffer, file.originalname);
      
      console.log(`[Admin Upload] File stored successfully:`, storageResult);
      
      // Parse file based on type
      let parsedData;
      const isExcel = file.originalname.endsWith('.xlsx') || file.originalname.endsWith('.xls');
      
      try {
        if (isExcel) {
          parsedData = parseExcelFile(file.buffer, file.originalname);
        } else {
          parsedData = await parseCSVFile(file.buffer, file.originalname);
        }
        
        console.log(`[Admin Upload] Parsed ${parsedData.rows.length} rows from file`);
        
      } catch (parseError: any) {
        console.error('[Admin Upload] File parsing failed:', parseError);
        return res.status(400).json({ 
          error: "Failed to parse file", 
          details: parseError.message,
          storageInfo: storageResult
        });
      }
      
      // Check if we have data
      if (!parsedData.rows || parsedData.rows.length === 0) {
        return res.status(400).json({ 
          error: "No data found in file",
          headers: parsedData.headers
        });
      }
      
      // Process upload with intelligent handler
      try {
        const options = {
          autoEnrich: req.body?.autoEnrich === 'true',
          validateDuplicates: req.body?.validateDuplicates !== 'false',
          sourceName: req.body?.source || file.originalname,
          batchTags: req.body?.tags ? req.body.tags.split(',').map((t: string) => t.trim()) : [],
          intelligentProcessing: true
        };
        
        console.log('[Admin Upload] Processing with UnifiedUploadHandler:', options);
        
        const result = await uploadHandler.processUpload(
          file.buffer,
          file.originalname,
          userId,
          options
        );
        
        // Add storage information to result
        const enhancedResult = {
          ...result,
          storage: {
            type: storageResult.storageType,
            key: storageResult.storageKey,
            localPath: storageResult.filePath,
            fallbackUsed: storageResult.storageType === 'local'
          }
        };
        
        console.log('[Admin Upload] Upload completed successfully:', {
          batchId: result.batchId,
          processed: result.totalProcessed,
          successful: result.successfulImports,
          storageType: storageResult.storageType
        });
        
        res.json({
          success: true,
          message: `Successfully processed ${result.totalProcessed} leads`,
          result: enhancedResult
        });
        
      } catch (processingError: any) {
        console.error('[Admin Upload] Processing failed:', processingError);
        
        // Even if processing fails, we've stored the file
        res.status(500).json({
          error: "Failed to process uploaded data",
          details: processingError.message,
          storage: storageResult,
          hint: "File has been saved and can be reprocessed"
        });
      }
      
    } catch (error: any) {
      console.error('[Admin Upload] Unexpected error:', error);
      res.status(500).json({ 
        error: "Upload failed", 
        details: error.message 
      });
    }
  });
  
  /**
   * POST /api/admin/upload/retry - Retry processing a previously uploaded file
   */
  app.post("/api/admin/upload/retry", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { storageKey, storageType, filePath } = req.body;
      
      if (!storageKey) {
        return res.status(400).json({ error: "Storage key is required" });
      }
      
      let fileBuffer: Buffer;
      let filename = storageKey.split('/').pop() || 'upload.csv';
      
      // Retrieve file based on storage type
      if (storageType === 'local' && filePath) {
        try {
          fileBuffer = await fs.readFile(filePath);
          console.log(`[Retry] Loaded file from local storage: ${filePath}`);
        } catch (error: any) {
          return res.status(404).json({ 
            error: "File not found in local storage",
            details: error.message
          });
        }
      } else {
        return res.status(400).json({ 
          error: "Retry from S3 not yet implemented" 
        });
      }
      
      // Process with unified handler
      const result = await uploadHandler.processUpload(
        fileBuffer,
        filename,
        req.user!.id,
        {
          autoEnrich: req.body?.autoEnrich === 'true',
          validateDuplicates: true,
          intelligentProcessing: true
        }
      );
      
      res.json({
        success: true,
        message: `Successfully reprocessed ${result.totalProcessed} leads`,
        result
      });
      
    } catch (error: any) {
      console.error('[Retry Upload] Error:', error);
      res.status(500).json({ 
        error: "Retry failed", 
        details: error.message 
      });
    }
  });
  
  /**
   * GET /api/admin/upload/status - Check upload processing status
   */
  app.get("/api/admin/upload/status/:batchId", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { batchId } = req.params;
      
      // Get batch status from storage
      const batch = await storage.getLeadBatch(batchId);
      
      if (!batch) {
        return res.status(404).json({ error: "Batch not found" });
      }
      
      // Get lead count for this batch
      const leads = await storage.getLeadsByBatchId(batchId);
      
      res.json({
        batchId,
        status: batch.status,
        totalLeads: batch.totalLeads,
        processedLeads: leads.length,
        filename: batch.filename,
        uploadedAt: batch.uploadedAt,
        uploadedBy: batch.uploadedBy
      });
      
    } catch (error: any) {
      console.error('[Upload Status] Error:', error);
      res.status(500).json({ 
        error: "Failed to get status", 
        details: error.message 
      });
    }
  });
  
  console.log('[Admin Upload Routes] Initialized with fallback support');
}