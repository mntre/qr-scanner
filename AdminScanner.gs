// Admin QR Code Scanner – Google Apps Script
// Handles employee check-in and attendance logging

const ATTENDANCE_SHEET_ID = '1NUgxBOVFCFO5ar79daK-mGfxipQ7E0yUqn946KgLGdo';

function doGet() {
  return HtmlService.createHtmlOutputFromFile('AdminScannerUI')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// Receive QR code data from Netlify scanner
function doPost(e) {
  try {
    if (!e.postData || !e.postData.contents) {
      return ContentService.createTextOutput(JSON.stringify({error: 'No data'})).setMimeType(ContentService.MimeType.JSON);
    }

    const payload = JSON.parse(e.postData.contents);
    const employeeId = payload.employeeId;

    if (!employeeId) {
      return ContentService.createTextOutput(JSON.stringify({error: 'Missing employeeId'})).setMimeType(ContentService.MimeType.JSON);
    }

    // Log the check-in
    const result = logCheckIn(employeeId);

    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);

  } catch (e) {
    return ContentService.createTextOutput(JSON.stringify({error: e.message})).setMimeType(ContentService.MimeType.JSON);
  }
}

function scannerGetEmployeeInfo(employeeId) {
  try {
    if (!employeeId || employeeId.trim() === '') {
      return { error: 'Please enter a valid Employee ID' };
    }

    const trimmedId = employeeId.trim().toUpperCase();
    const sheet = SpreadsheetApp.openById(ATTENDANCE_SHEET_ID);
    const attendanceSheet = sheet.getSheets()[0];

    if (!attendanceSheet) {
      return { error: 'Attendance sheet not found' };
    }

    const data = attendanceSheet.getDataRange().getValues();
    
    if (data.length < 2) {
      return { error: 'No employee data found in sheet' };
    }

    const headers = data[0];
    const idColIndex = headers.findIndex(h => 
      /employee.?id|emp.?id|id/i.test(String(h))
    );

    if (idColIndex === -1) {
      return { error: 'Employee ID column not found in sheet' };
    }

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const id = String(row[idColIndex] || '').trim().toUpperCase();

      if (id === trimmedId) {
        return {
          employeeId: row[idColIndex] || employeeId,
          fullName: row[1] || 'Unknown',
          email: row[2] || 'N/A'
        };
      }
    }

    return { error: 'Employee ID not found: ' + employeeId };
  } catch (e) {
    return { error: 'Lookup failed: ' + e.message };
  }
}

function logCheckIn(employeeId) {
  try {
    if (!employeeId) {
      return { error: 'Missing employee ID' };
    }

    const sheet = SpreadsheetApp.openById(ATTENDANCE_SHEET_ID);
    let attendanceSheet = sheet.getSheetByName('Check-Ins');
    
    if (!attendanceSheet) {
      attendanceSheet = sheet.insertSheet('Check-Ins');
      attendanceSheet.appendRow(['Timestamp', 'Employee ID']);
    }

    const now = new Date();
    const timestamp = now.toLocaleString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    attendanceSheet.appendRow([timestamp, employeeId]);
    return { success: true };
  } catch (e) {
    return { error: 'Failed to log check-in: ' + e.message };
  }
}

function getTodayCheckIns() {
  try {
    const sheet = SpreadsheetApp.openById(ATTENDANCE_SHEET_ID);
    const attendanceSheet = sheet.getSheetByName('Check-Ins');
    
    if (!attendanceSheet) {
      return [];
    }

    const data = attendanceSheet.getDataRange().getValues();
    if (data.length < 2) {
      return [];
    }

    const today = new Date();
    const todayStr = (today.getMonth() + 1).toString().padStart(2, '0') + '/' +
                     today.getDate().toString().padStart(2, '0') + '/' +
                     today.getFullYear();

    const todayCheckIns = [];
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const timestamp = String(row[0] || '');
      
      if (timestamp.startsWith(todayStr)) {
        todayCheckIns.push({
          timestamp: row[0],
          employeeId: row[1]
        });
      }
    }

    return todayCheckIns;
  } catch (e) {
    return [];
  }
}
