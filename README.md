# QR Code Scanner - Employee Check-In System

A standalone QR code scanner application for real-time employee check-in logging to Google Sheets.

## Features

✅ **Camera-based QR scanning** - Real-time QR code detection using html5-qrcode  
✅ **Automatic check-in logging** - Instantly records scanned employee IDs  
✅ **No Camera Restrictions** - Hosted on Vercel for full camera access (not restricted by Google Apps Script sandbox)  
✅ **Mobile Optimized** - Works perfectly on phones and tablets  
✅ **Configurable** - Stores Google Apps Script URL in browser local storage  
✅ **Beep Feedback** - Audio confirmation on successful scans  

## Getting Started

1. **Open the scanner**: Visit your Vercel deployment URL
2. **Configure**: Enter your Google Apps Script Web App URL
3. **Start scanning**: Click "🎥 Start Scanner" and grant camera permission
4. **Scan QR codes**: Point at QR codes to check in employees

## Setup

### Prerequisites
- Google Apps Script project with `doPost()` endpoint (receives check-in data)
- QR codes containing employee IDs
- Modern web browser with camera access

### Google Apps Script Setup

```javascript
function doPost(e) {
  const payload = JSON.parse(e.postData.contents);
  const employeeId = payload.employeeId;
  // Log to Google Sheet
}
```

## Architecture

```
Phone Browser
    ↓
Vercel (Scanner) ← Full HTTPS origin + camera access
    ↓
Google Apps Script doPost() ← Receives scanned data
    ↓
Google Sheet ← Logs check-in records
```

## Files

- `index.html` - Main QR scanner application
- `vercel.json` - Vercel deployment configuration
- `.vercelignore` - Files to exclude from deployment

## Deployment

This project is deployed on Vercel for reliable HTTPS hosting and camera access.

**Live URL**: Check your Vercel dashboard

## License

Free to use for employee check-in systems.
