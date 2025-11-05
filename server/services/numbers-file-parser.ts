import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const execAsync = promisify(exec);

interface NumbersParseResult {
  success: boolean;
  sheets?: Array<{
    name: string;
    tables: Array<{
      name: string;
      headers: string[];
      rows: Record<string, any>[];
      num_rows: number;
      num_cols: number;
    }>;
  }>;
  error?: string;
  error_type?: string;
}

export class NumbersFileParser {
  private pythonScriptPath: string;
  
  constructor() {
    this.pythonScriptPath = path.join(process.cwd(), 'server', 'utils', 'numbers-parser.py');
  }

  /**
   * Parse an Apple Numbers file
   * @param fileBuffer - The file buffer
   * @param fileName - Original file name
   * @returns Parsed data with headers and rows
   */
  async parseNumbersFile(
    fileBuffer: Buffer,
    fileName: string
  ): Promise<{ headers: string[]; rows: Record<string, any>[] }> {
    // Create temporary file
    const tempDir = path.join(process.cwd(), 'temp');
    await fs.mkdir(tempDir, { recursive: true });
    
    const tempFileName = `${crypto.randomBytes(8).toString('hex')}_${fileName}`;
    const tempFilePath = path.join(tempDir, tempFileName);
    
    try {
      // Write buffer to temp file
      await fs.writeFile(tempFilePath, fileBuffer);
      
      console.log(`[NumbersParser] Parsing Numbers file: ${fileName}`);
      
      // Call Python parser
      const { stdout, stderr } = await execAsync(
        `python3 "${this.pythonScriptPath}" "${tempFilePath}" json`,
        { maxBuffer: 50 * 1024 * 1024 } // 50MB buffer for large files
      );
      
      if (stderr && !stderr.includes('RuntimeWarning')) {
        console.warn('[NumbersParser] Python stderr:', stderr);
      }
      
      // Parse JSON result
      const result: NumbersParseResult = JSON.parse(stdout);
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to parse Numbers file');
      }
      
      // Extract first table from first sheet
      if (!result.sheets || result.sheets.length === 0) {
        throw new Error('No sheets found in Numbers file');
      }
      
      const firstSheet = result.sheets[0];
      if (!firstSheet.tables || firstSheet.tables.length === 0) {
        throw new Error('No tables found in first sheet');
      }
      
      const firstTable = firstSheet.tables[0];
      
      console.log(`[NumbersParser] Successfully parsed Numbers file:`);
      console.log(`  - Sheet: ${firstSheet.name}`);
      console.log(`  - Table: ${firstTable.name}`);
      console.log(`  - Rows: ${firstTable.num_rows}`);
      console.log(`  - Columns: ${firstTable.num_cols}`);
      console.log(`  - Headers: ${firstTable.headers.slice(0, 10).join(', ')}`);
      
      return {
        headers: firstTable.headers,
        rows: firstTable.rows
      };
      
    } catch (error: any) {
      console.error('[NumbersParser] Error parsing Numbers file:', error);
      throw new Error(`Failed to parse Numbers file: ${error.message}`);
    } finally {
      // Clean up temp file
      try {
        await fs.unlink(tempFilePath);
      } catch (cleanupError) {
        console.warn('[NumbersParser] Failed to cleanup temp file:', cleanupError);
      }
    }
  }

  /**
   * Check if a file is a Numbers file based on signature
   */
  static isNumbersFile(buffer: Buffer): boolean {
    // Numbers files are ZIP-based and start with PK signature
    if (buffer.length < 4) return false;
    
    const signature = buffer.slice(0, 4).toString('hex').toUpperCase();
    return signature === '504B0304'; // ZIP signature
  }

  /**
   * Check if file extension suggests Numbers file
   */
  static hasNumbersExtension(fileName: string): boolean {
    const ext = path.extname(fileName).toLowerCase();
    return ext === '.numbers';
  }
}

export const numbersFileParser = new NumbersFileParser();
