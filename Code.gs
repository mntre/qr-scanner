// ─────────────────────────────────────────────────────────────────────────────
//  QR Code Mailer – Google Apps Script
//  Serves the web app and handles CSV import + QR generation + email sending
// ─────────────────────────────────────────────────────────────────────────────

// ── Entry points ──────────────────────────────────────────────────────────────

function doGet(e) {
  // Check if this is a check-in request
  if (e && e.parameter && e.parameter.checkin) {
    return HtmlService.createTemplateFromFile('CheckIn')
      .evaluate()
      .setTitle('Employee Check-In')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }
  
  // Default: main QR mailer interface
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Employee QR Code Mailer')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// Utility: include HTML partials
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// ── Check-In Functions ──────────────────────────────────────────────────────

const SHEET_ID = '1NUgxBOVFCFO5ar79daK-mGfxipQ7E0yUqn946KgLGdo';
const EMPLOYEE_SHEET = 'Employee Data';
const CHECKIN_LOG_SHEET = 'Check-In Log';

/**
 * Fetch all employee data from the Google Sheet.
 * Returns array of {employeeId, fullName}
 */
function getEmployeeData() {
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sheet = ss.getSheetByName(EMPLOYEE_SHEET);
    
    if (!sheet) {
      throw new Error(`Sheet "${EMPLOYEE_SHEET}" not found`);
    }
    
    const data = sheet.getDataRange().getValues();
    if (data.length < 2) {
      return { error: 'No employee data found' };
    }
    
    const headers = data[0];
    const employeeIdIdx = headers.findIndex(h => /employee.?id|emp.?id|id/i.test(h));
    const fullNameIdx = headers.findIndex(h => /full.?name|name/i.test(h));
    
    if (employeeIdIdx === -1 || fullNameIdx === -1) {
      throw new Error('Could not find Employee ID or Full Name column');
    }
    
    const employees = [];
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const empId = (row[employeeIdIdx] || '').toString().trim();
      const fullName = (row[fullNameIdx] || '').toString().trim();
      
      if (empId && fullName) {
        employees.push({ employeeId: empId, fullName: fullName });
      }
    }
    
    return { employees };
  } catch (e) {
    return { error: e.message };
  }
}

/**
 * Find an employee by ID and return their info.
 * @param {string} employeeId
 * @returns {Object} { found: bool, employeeId, fullName, error? }
 */
function getEmployeeById(employeeId) {
  try {
    if (!employeeId || employeeId.trim() === '') {
      return { found: false, error: 'Employee ID is required' };
    }
    
    const result = getEmployeeData();
    if (result.error) {
      return { found: false, error: result.error };
    }
    
    const employee = result.employees.find(e => 
      e.employeeId.toLowerCase() === employeeId.toLowerCase()
    );
    
    if (!employee) {
      return { found: false, error: `Employee ID "${employeeId}" not found` };
    }
    
    return { 
      found: true, 
      employeeId: employee.employeeId, 
      fullName: employee.fullName 
    };
  } catch (e) {
    return { found: false, error: e.message };
  }
}

/**
 * Log a check-in record to the Check-In Log sheet.
 * @param {string} employeeId
 * @param {string} fullName
 * @returns {Object} { success: bool, message, error? }
 */
function logCheckIn(employeeId, fullName) {
  try {
    if (!employeeId || !fullName) {
      throw new Error('Employee ID and Full Name are required');
    }
    
    const ss = SpreadsheetApp.openById(SHEET_ID);
    let sheet = ss.getSheetByName(CHECKIN_LOG_SHEET);
    
    // Create sheet if it doesn't exist
    if (!sheet) {
      sheet = ss.insertSheet(CHECKIN_LOG_SHEET);
      // Add headers
      sheet.appendRow(['Employee ID', 'Full Name', 'Timestamp', 'Check-In Status']);
    }
    
    // Append check-in record
    const timestamp = new Date().toLocaleString();
    sheet.appendRow([employeeId, fullName, timestamp, 'Checked In']);
    
    return {
      success: true,
      message: `Check-in logged for ${fullName}`
    };
  } catch (e) {
    return {
      success: false,
      error: e.message
    };
  }
}


// ── CSV Processing ─────────────────────────────────────────────────────────────

/**
 * Receives base64-encoded CSV content from the client,
 * parses it, and returns a preview of the data.
 *
 * @param {string} csvBase64 - Base64-encoded CSV string
 * @returns {Object} { headers, rows, employeeIdCol, emailCol }
 */
function parseCSV(csvBase64) {
  try {
    const csvText = Utilities.newBlob(
      Utilities.base64Decode(csvBase64)
    ).getDataAsString();

    const rows = Utilities.parseCsv(csvText);
    if (!rows || rows.length < 2) {
      return { error: 'CSV must have at least a header row and one data row.' };
    }

    const headers = rows[0].map(h => h.trim());

    // Auto-detect Employee ID and Email columns (case-insensitive)
    const employeeIdCol = headers.findIndex(h =>
      /employee.?id|emp.?id|id/i.test(h)
    );
    const emailCol = headers.findIndex(h =>
      /email|e-mail|mail/i.test(h)
    );

    if (employeeIdCol === -1) {
      return { error: 'Could not find an "Employee ID" column. Please check your CSV headers.' };
    }
    if (emailCol === -1) {
      return { error: 'Could not find an "Email" column. Please check your CSV headers.' };
    }

    // Return first 5 rows as preview
    const preview = rows.slice(1, 6).map(row => ({
      employeeId: row[employeeIdCol] || '',
      email: row[emailCol] || '',
      raw: row
    }));

    return {
      headers,
      preview,
      employeeIdCol,
      emailCol,
      totalRows: rows.length - 1 // exclude header
    };

  } catch (e) {
    return { error: 'Failed to parse CSV: ' + e.message };
  }
}

// ── QR Code Generation & Mailing ───────────────────────────────────────────────

/**
 * Main function: parse the CSV, generate QR codes, and send emails.
 * Called by the client after user confirms the preview.
 *
 * @param {string} csvBase64 - Base64-encoded CSV string
 * @param {Object} config    - { employeeIdCol, emailCol }
 * @returns {Object} { sent, failed, log[] }
 */
function processAndSendQRCodes(csvBase64, config) {
  try {
    const csvText = Utilities.newBlob(
      Utilities.base64Decode(csvBase64)
    ).getDataAsString();

    const rows = Utilities.parseCsv(csvText);
    const dataRows = rows.slice(1); // skip header

    const results = { sent: 0, failed: 0, log: [] };

    dataRows.forEach((row, index) => {
      const employeeId = (row[config.employeeIdCol] || '').trim();
      const email      = (row[config.emailCol] || '').trim();

      if (!employeeId || !email) {
        results.failed++;
        results.log.push({
          row: index + 2,
          employeeId,
          email,
          status: 'SKIPPED',
          reason: 'Missing Employee ID or Email'
        });
        return;
      }

      // Basic email validation
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        results.failed++;
        results.log.push({
          row: index + 2,
          employeeId,
          email,
          status: 'FAILED',
          reason: 'Invalid email address'
        });
        return;
      }

      try {
        // Generate QR code as a blob using Google Charts API
        const qrBlob = generateQRCodeBlob(employeeId);

        // Send email with the QR code attached and embedded
        sendQREmail(email, employeeId, qrBlob);

        results.sent++;
        results.log.push({
          row: index + 2,
          employeeId,
          email,
          status: 'SENT'
        });

      } catch (sendError) {
        results.failed++;
        results.log.push({
          row: index + 2,
          employeeId,
          email,
          status: 'FAILED',
          reason: sendError.message
        });
      }

      // Throttle to stay within Gmail quotas (1 email/sec)
      Utilities.sleep(300);
    });

    return results;

  } catch (e) {
    return { error: 'Processing failed: ' + e.message };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Generates a QR code PNG using qrcode-monkey.com API
 * and returns it as a Blob. The QR encodes the employee ID string.
 *
 * This API is free, reliable, and doesn't require authentication.
 */
function generateQRCodeBlob(employeeId) {
  try {
    const encodedId = encodeURIComponent(employeeId);
    
    // Use qrcode-monkey API - free, reliable, no auth required
    // Returns PNG directly
    const url = `https://qr-code-monkey.com/qr/custom?url=${encodedId}&size=300&border=1&format=png`;

    const response = UrlFetchApp.fetch(url, { 
      muteHttpExceptions: true,
      headers: { 'User-Agent': 'Google-Apps-Script' }
    });
    
    const statusCode = response.getResponseCode();

    if (statusCode !== 200) {
      throw new Error(`HTTP ${statusCode}`);
    }

    const blob = response.getBlob();
    const contentType = blob.getContentType();
    
    if (!contentType || !contentType.startsWith('image/')) {
      throw new Error(`Unexpected response type: ${contentType}`);
    }

    return blob.setName(`QR_${employeeId}.png`).setContentType('image/png');
    
  } catch (e) {
    // Fallback: try alternative QR service
    try {
      const encodedId = encodeURIComponent(employeeId);
      const url = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodedId}&format=png`;
      
      const response = UrlFetchApp.fetch(url, { 
        muteHttpExceptions: true,
        headers: { 'User-Agent': 'Google-Apps-Script' }
      });
      
      if (response.getResponseCode() !== 200) {
        throw new Error('Fallback failed');
      }
      
      const blob = response.getBlob();
      return blob.setName(`QR_${employeeId}.png`).setContentType('image/png');
      
    } catch (fallbackError) {
      throw new Error(`QR generation failed: ${e.message}`);
    }
  }
}

/**
 * Sends an HTML email to the employee with their QR code embedded.
 */
function sendQREmail(email, employeeId, qrBlob) {
  const subject = `Your Event QR Code – Employee ID: ${employeeId}`;

  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body {
      margin: 0; padding: 0;
      background-color: #0d0d0d;
      font-family: 'Segoe UI', Arial, sans-serif;
      color: #f0f0f0;
    }
    .container {
      max-width: 520px;
      margin: 30px auto;
      background: #1a1a1a;
      border: 2px solid #00e676;
      border-radius: 12px;
      overflow: hidden;
    }
    .header {
      background: linear-gradient(135deg, #00e676 0%, #00c853 100%);
      padding: 28px 24px;
      text-align: center;
    }
    .header h1 {
      margin: 0;
      font-size: 22px;
      font-weight: 800;
      color: #0d0d0d;
      letter-spacing: 2px;
      text-transform: uppercase;
    }
    .header p {
      margin: 6px 0 0;
      font-size: 13px;
      color: #1a1a1a;
      font-weight: 600;
    }
    .body {
      padding: 32px 24px;
      text-align: center;
    }
    .body p {
      font-size: 15px;
      color: #cccccc;
      line-height: 1.6;
    }
    .emp-id-badge {
      display: inline-block;
      background: #00e676;
      color: #0d0d0d;
      font-weight: 900;
      font-size: 20px;
      letter-spacing: 3px;
      padding: 10px 28px;
      border-radius: 6px;
      margin: 16px 0;
    }
    .qr-wrapper {
      background: #ffffff;
      display: inline-block;
      padding: 16px;
      border-radius: 10px;
      margin: 20px 0;
      border: 3px solid #00e676;
    }
    .qr-wrapper img {
      display: block;
      width: 220px;
      height: 220px;
    }
    .instructions {
      font-size: 13px;
      color: #888;
      margin-top: 8px;
    }
    .footer {
      background: #111;
      padding: 16px 24px;
      text-align: center;
      font-size: 11px;
      color: #555;
      border-top: 1px solid #222;
    }
    .footer span { color: #00e676; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>&#9733; Event Access QR Code &#9733;</h1>
      <p>Present this QR code at the venue entrance</p>
    </div>
    <div class="body">
      <p>Hello,</p>
      <p>Here is your unique QR code for the upcoming event.<br>
         Please screenshot or print it and bring it with you.</p>
      <div class="emp-id-badge">${employeeId}</div>
      <br>
      <div class="qr-wrapper">
        <img src="cid:qr_code" alt="QR Code for ${employeeId}" />
      </div>
      <p class="instructions">
        Scan this code at the registration booth to check in.<br>
        Do not share this QR code with others.
      </p>
    </div>
    <div class="footer">
      &copy; ${new Date().getFullYear()} &mdash; Powered by <span>QR Mailer</span>
    </div>
  </div>
</body>
</html>
  `;

  GmailApp.sendEmail(email, subject, '', {
    htmlBody: htmlBody,
    inlineImages: { qr_code: qrBlob },
    attachments: [qrBlob],
    name: 'Event Registration Team'
  });
}
