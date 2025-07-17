
const puppeteer = require('puppeteer');


const fs = require('fs');
const path = require('path');

const nodemailer = require('nodemailer');


// ================================
// send email with the csv
//=================================
// Email credentials from environment variables on git hub
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;
const EMAIL_TO = process.env.EMAIL_TO;

async function sendEmailWithAttachment(filePath, fileName) {
  let transporter = nodemailer.createTransport({
    service: 'gmail', // Or another service
    auth: {
      user: EMAIL_USER,
      pass: EMAIL_PASS,
    },
  });

  let info = await transporter.sendMail({
    from: `"Looker Bot" <${EMAIL_USER}>`,
    to: EMAIL_TO,
    subject: `Looker Export: ${fileName}`,
    text: `Automated export for ${fileName}`,
    attachments: [
      {
        filename: fileName,
        path: filePath,
      },
    ],
  });

  console.log('✅ Email sent:', info.messageId);
}


const start_time = Date.now();

// =========================================================================================
//                      Select desired date range Here (format : '2025-04-30')
//==========================================================================================
// --------- DATE = 'YYYY-MM-DD'

const START_DATE = '2025-07-01';
const END_DATE = '2025-07-02';

// =========================================================================================
// =========================================================================================



function getDateList(start, end) {
  const dates = [];
  let current = new Date(start);
  const last = new Date(end);
  while (current <= last) {
    dates.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

function getCalendarMonthLabel(date) {
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }).toUpperCase();
}
function formatDate(date) {
  // Format: May 1, 2025 (for aria-label)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatFileDate(date) {
  // Format: 2025-05-01
  return date.toISOString().slice(0, 10);
}


(async () => {

 const downloadPath = path.resolve(__dirname, 'Export');
  if (!fs.existsSync(downloadPath)) {
    fs.mkdirSync(downloadPath, { recursive: true });
  }


  // 1. Launch browser and go to the report URL
  const browser = await puppeteer.launch({  executablePath: '/usr/bin/google-chrome',args: ['--no-sandbox', '--disable-setuid-sandbox'], headless: true });
  const page = await browser.newPage();
  await page.goto('https://lookerstudio.google.com/reporting/cf50c9e0-7f4b-4e12-9583-3c2476b5d45b', { waitUntil: 'networkidle2' });

// =============================================================
// 10 Sec for page load
  await new Promise(resolve => setTimeout(resolve, 30000));
//==============================================================

  //  Set downlaod Path
  const client = await page.target().createCDPSession();
  await client.send('Page.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: downloadPath,
  });


// ============
//  dates loop
//==============


const dates = getDateList(START_DATE, END_DATE);

for (let date of dates) {
    const dateLabel = formatDate(date); // e.g., May 1, 2025
    const fileDate = formatFileDate(date); // e.g., 2025-05-01
    const monthlabel =getCalendarMonthLabel(date);// e.g., Apr 1, 2025


 
// =======================
// Date pick
//========================
// 1. Open the date picker
await page.click('button.ng2-date-picker-button.canvas-date-input');

// 2. Wait for the overlay to appear
await page.waitForSelector('.canvas-date-picker-dialog', {timeout: 30000});

// Helper function to set a calendar panel to a specific month/year
async function setCalendarMonth(panelClass, targetMonthYear) {
   const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

  while (true) {
    // Get the month label in the current panel
    const monthLabel = await page.$eval(
      `.${panelClass} .mat-calendar-period-button span[aria-hidden="true"]`,
      el => el.textContent.trim().toUpperCase()
    );
    if (monthLabel === targetMonthYear.toUpperCase()) break;
    // Click previous month button in this panel
      // Parse current and target
    const [currentMonth, currentYear] = monthLabel.split(' ');
    const [targetMonth, targetYear] = targetMonthYear.toUpperCase().split(' ');

    // Calculate difference
    const currentIndex = months.indexOf(currentMonth);
    const targetIndex = months.indexOf(targetMonth);
    const yearDiff = parseInt(targetYear) - parseInt(currentYear);
    const monthDiff = targetIndex - currentIndex + yearDiff * 12;

    if (monthDiff < 0) {
      // Click previous month button
      await page.click(`.${panelClass} .mat-calendar-previous-button`);
    } else {
      // Click next month button
      await page.click(`.${panelClass} .mat-calendar-next-button`);
    }

    // =============================================================
    // 0.5 Sec for date selection to take place
    await new Promise(resolve => setTimeout(resolve, 500));// Wait for UI update
    // =============================================================
  }
}

// 3. Switch Start calendar to "SEP 2025"
await setCalendarMonth('start-date-picker', monthlabel);

// 4. Switch End calendar to "SEP 2025"
await setCalendarMonth('end-date-picker', monthlabel);

// 5. Click start date (May 29, 2025)
await page.click(`.start-date-picker [aria-label="${dateLabel}"]`);


// 6. Click end date (May 30, 2025)
await page.click(`.end-date-picker [aria-label="${dateLabel}"]`);


// 7. Click Apply
await page.click('button.apply-button');

console.log('Date range selected and applied!');

//================


// =============================================================
// 20 Sec for table load
await new Promise(resolve => setTimeout(resolve, 5000));

//===============================================================

// wait until column "date" appear

//  await page.waitForSelector('.centerHeaderRow .colName[title="Date"]', { visible: true, timeout: 120000 });



async function waitForMatchingDate(page, dateLabel, maxTries = 20) {
  let tries = 0;
  while (tries < maxTries) {
    // Wait for the cell to load and get its value
    await page.waitForFunction(() => {
      const cell = document.querySelector('.centerColsContainer .row.index-0 .cell:nth-child(2) .cell-value');
      return cell && cell.textContent.trim().length > 0;
    }, { timeout: 120000 });

    const firstDateValue = await page.$eval(
      '.centerColsContainer .row.index-0 .cell:nth-child(2) .cell-value',
      el => el.textContent.trim()
    );
// console.log('First date value:', firstDateValue);
    if (firstDateValue === dateLabel) {
      console.log('Date matched:', firstDateValue);
      return true; // Continue
    } else {
      console.log(`Date "${firstDateValue}" does not match "${dateLabel}". Retrying in 15s...`);
      await new Promise(res => setTimeout(res, 15000)); // Wait 15 seconds
      tries++;
    }
  }
  throw new Error('Date did not match after maximum retries.');
}

// Usage:
await waitForMatchingDate(page, dateLabel);


//==========================
  // 2. Wait for the table to appear
  await page.waitForSelector('.lego-component.simple-table', { timeout: 180000 });

// =============================================================
// 3 Sec after table load
  await new Promise(resolve => setTimeout(resolve, 3000));
//===============================================================



  // 3. Wait for and click the "three dots" menu button
  await page.waitForSelector('button.ng2-chart-menu-button', { timeout: 20000 });
  const menuBtn = await page.$('button.ng2-chart-menu-button');
  if (!menuBtn) {
    console.error('Three dots menu button not found!');
    await browser.close();
    return;
  }

  
  await menuBtn.evaluate(el => el.scrollIntoView({ block: 'center' }));
  await menuBtn.hover();
  await new Promise(resolve => setTimeout(resolve, 500)); // Small delay after hover
  await menuBtn.click();
  console.log('Clicked the "three dots" (chart menu) button.');

  // 4. Wait for the Export option to appear and be enabled
  await page.waitForSelector('button[data-test-id="Export"]:not([disabled])', { timeout: 10000 });

// Try force-clicking with evaluate (bypasses Puppeteer click issues)

const exportClicked = await page.evaluate(() => {
  const btn = document.querySelector('button[data-test-id="Export"]:not([disabled])');
  if (btn) {
    // btn.scrollIntoView({ block: 'center' });
    btn.click();
    return true;
  }
  return false;
});

if (exportClicked) {
  console.log('Clicked Export via evaluate.');
} else {
  console.error('Export button not found or not clickable!');
  await page.screenshot({ path: 'debug_menu.png' });

}
// =============================================================
// 1 Sec to format file menu load
  await new Promise(resolve => setTimeout(resolve, 1000));
// =============================================================


// 5. Wait for the export radio group and select the desired type
await page.waitForSelector('.mat-mdc-radio-group.export-item-group', { timeout: 10000 });

const exportType = 'CSV (Excel)'; // or 'CSV', 'Google Sheets'
const radioSelected = await page.evaluate((exportType) => {
  const labels = Array.from(document.querySelectorAll('.mat-mdc-radio-group.export-item-group label.mdc-label'));
  for (const label of labels) {
    if (label.innerText.trim() === exportType) {
      label.click();
      return true;
    }
  }
  return false;
}, exportType);

if (radioSelected) {
  console.log(`Selected export type: ${exportType}`);
} else {
  console.error(`Export type "${exportType}" not found!`);
  await page.screenshot({ path: 'debug_radio_selection.png' });
}
// =============================================================
// 0.5 Sec to select Fromat
  await new Promise(resolve => setTimeout(resolve, 500));
// =============================================================


// check for files count 

// Helper to count files in download directory
function countFiles(dir) {
return fs.readdirSync(dir)
    .filter(file => path.extname(file).toLowerCase() === '.csv')
    .length;
}

// 1. Count files before download
const beforeCount = countFiles(downloadPath);


// 6. final export check and click
// Wait for the dialog container to appear
await page.waitForSelector('.mat-mdc-dialog-container', { timeout: 5000 });

// Click the Export button inside the export dialog
const finalExportClicked = await page.evaluate(() => {
  // Find dialog container
  const dialog = document.querySelector('.mat-mdc-dialog-container');
  if (!dialog) return false;
  // Find all buttons in the dialog actions
  const buttons = Array.from(dialog.querySelectorAll('.mat-mdc-dialog-actions button'));
  for (const btn of buttons) {
    const label = btn.querySelector('.mdc-button__label');
    if (label && label.innerText.trim().toLowerCase() === 'export') {
      label.scrollIntoView({ block: 'center' });
      btn.click();
      return true;
    }
  }
  return false;
});

if (!finalExportClicked) {
  console.error('Final Export button not found!');
  await page.screenshot({ path: 'debug_final_export.png' });
  await browser.close();
  return;
}
console.log('Clicked the final Export button.');

  // 7. Wait for download dialog or next steps (adjust as needed)
  // =============================================================
  // 10 Sec estimated download time before rename.
  // await new Promise(resolve => setTimeout(resolve, 30000));

// wait until files count increased by 1 

  const waitForDownload = async (dir, expectedCount, timeout = 120000) => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (countFiles(dir) > expectedCount) return;
    await new Promise(res => setTimeout(res, 1000)); // Check every 1s
  }
  throw new Error('Download did not complete in time');
  
};

await waitForDownload(downloadPath, beforeCount);


  // =============================================================

 const files = fs.readdirSync(downloadPath)
      .map(f => ({ name: f, time: fs.statSync(path.join(downloadPath, f)).mtime.getTime() }))
      .sort((a, b) => b.time - a.time);
    const latestFile = files[0] ? files[0].name : null;

    if (latestFile) {
      // 8. Rename file to include date
      const ext = path.extname(latestFile);
      const newFileName = `export_traffic_src_${fileDate}${ext}`;
      fs.renameSync(path.join(downloadPath, latestFile), path.join(downloadPath, newFileName));
      console.log(`Downloaded and renamed: ${newFileName}`);

    // Send the file as an email attachment
    await sendEmailWithAttachment(newPath, newFileName);

    } else {
      console.error('No file found to rename!');
    }


      // 9. Calculate time from Process start

    const end_time = Date.now();
    const elapsedTime = end_time - start_time;

    const totalSeconds = Math.floor(elapsedTime / 1000);
    const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
    const seconds = String(totalSeconds % 60).padStart(2, '0');

  console.log(`Elapsed time: ${minutes}:${seconds}`);
  }

 await browser.close(); // Uncomment when you want to close the browser automatically
})();