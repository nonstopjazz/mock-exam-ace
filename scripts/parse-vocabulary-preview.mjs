import XLSX from 'xlsx';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read the Excel file
const filePath = path.resolve(__dirname, '../data/gsat_5543_vocabulary.xlsx');
const workbook = XLSX.readFile(filePath);

// Get sheet names
console.log('=== Sheet Names ===');
console.log(workbook.SheetNames);

// For each sheet, show structure
workbook.SheetNames.forEach((sheetName) => {
  console.log(`\n=== Sheet: ${sheetName} ===`);
  const worksheet = workbook.Sheets[sheetName];

  // Get the range
  const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
  console.log(`Rows: ${range.e.r + 1}, Columns: ${range.e.c + 1}`);

  // Convert to JSON to see structure
  const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

  // Show first 10 rows
  console.log('\nFirst 10 rows (preview):');
  jsonData.slice(0, 10).forEach((row, index) => {
    console.log(`Row ${index + 1}:`, row);
  });

  // Show column headers (first row)
  console.log('\nColumn headers:', jsonData[0]);

  // Show total word count
  console.log(`\nTotal data rows: ${jsonData.length - 1}`);
});
