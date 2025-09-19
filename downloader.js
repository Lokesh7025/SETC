// downloader.js - A script to automate downloading Excel files from a website.
// This uses Puppeteer to control a Chrome browser.

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

// --- CONFIGURATION ---
const ESSL_LOGIN_URL = 'http://localhost/iclock/Main.aspx';
const USERNAME = 'essl';
const PASSWORD = 'essl';

// The path where your server.js and attendance.xlsx should be.
const DOWNLOAD_PATH = 'C:\\ESSL_PULL';

async function downloadAttendanceReport() {
    console.log('Launching browser...');

    // Check if the download directory exists, create it if not.
    if (!fs.existsSync(DOWNLOAD_PATH)) {
        console.log(`Download directory not found. Creating it at: ${DOWNLOAD_PATH}`);
        fs.mkdirSync(DOWNLOAD_PATH, { recursive: true });
    }

    // --- CORRECTED: Added arguments to disable the browser's password manager ---
    const browser = await puppeteer.launch({ 
        headless: false, 
        defaultViewport: null,
        args: ['--disable-features=PasswordManager'] // This line prevents the pop-up
    });
    
    const page = await browser.newPage();
    
    // Tell Puppeteer where to save downloaded files.
    const client = await page.target().createCDPSession();
    await client.send('Page.setDownloadBehavior', {
        behavior: 'allow',
        downloadPath: DOWNLOAD_PATH,
    });

    try {
        console.log(`Navigating to ${ESSL_LOGIN_URL}...`);
        await page.goto(ESSL_LOGIN_URL, { waitUntil: 'networkidle2' });

        console.log('Attempting to find and fill login form...');
        
        let loginFrame = page;
        const iframeElementHandle = await page.$('iframe'); 
        if (iframeElementHandle) {
            console.log('An iframe was found on the login page. Attempting to access it.');
            const frame = await iframeElementHandle.contentFrame();
            if (frame) {
                const usernameFieldInFrame = await frame.$('#StaffloginDialog_txt_LoginName');
                if (usernameFieldInFrame) {
                    console.log('Login form found inside the iframe. Proceeding with login...');
                    loginFrame = frame;
                } else {
                    console.log('Iframe found, but login form was not inside it. Will try the main page.');
                }
            }
        } else {
            console.log('No iframe found on the login page. Assuming form is on the main page.');
        }

        console.log('Logging in...');
        await loginFrame.type('#StaffloginDialog_txt_LoginName', USERNAME);
        await loginFrame.type('#StaffloginDialog_Txt_Password', PASSWORD);
        await loginFrame.click('#StaffloginDialog_Btn_Ok');

        await page.waitForSelector('#EasymenuMain', { visible: true });
        console.log('Login successful!');
        
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for page to settle

        // --- NAVIGATE TO THE REPORT PAGE ---
        console.log('Hovering over the "Reports" menu...');
        await page.hover('#Reports');
        
        await page.waitForSelector('#ExportLogs', { visible: true });
        console.log('Hovering over "Export Logs"...');
        await page.hover('#ExportLogs');
        
        await page.waitForSelector('#MenuItem16', { visible: true });
        console.log('Clicking on "Export Attendance Logs"...');
        await page.click('#MenuItem16');

        // --- INTERACT WITH THE REPORT PAGE (INSIDE THE IFRAME) ---
        console.log('Waiting for the report page to load inside the iframe...');
        await page.waitForSelector('iframe#tabIframe');
        await new Promise(resolve => setTimeout(resolve, 5000));
        const iframeElement = await page.$('iframe#tabIframe');
        const frame = await iframeElement.contentFrame();

        if (!frame) {
            throw new Error('Could not access the iframe content.');
        }

        console.log('Successfully accessed the iframe.');
        
        // --- CLICK THE EXPORT BUTTON ---
        const exportButtonSelector = '#btnExport'; // <--- VERIFY AND CHANGE THIS
        
        console.log(`Waiting for the export button: "${exportButtonSelector}"`);
        await frame.waitForSelector(exportButtonSelector, { visible: true });
        
        console.log('Clicking the export button to download the file...');
        await frame.click(exportButtonSelector);

        // Give the file some time to download.
        console.log('Waiting for download to complete... (waiting 15 seconds)');
        await new Promise(resolve => setTimeout(resolve, 15000));
        
        // --- RENAME THE FILE ---
        const files = fs.readdirSync(DOWNLOAD_PATH);
        const downloadedFile = files.find(f => (f.endsWith('.xlsx') || f.endsWith('.xls')) && f !== 'attendance.xlsx');
        
        if (downloadedFile) {
            const oldPath = path.join(DOWNLOAD_PATH, downloadedFile);
            const newPath = path.join(DOWNLOAD_PATH, 'attendance.xlsx');
            if (fs.existsSync(newPath)) {
                fs.unlinkSync(newPath); // Delete old attendance.xlsx if it exists
            }
            fs.renameSync(oldPath, newPath);
            console.log(`Successfully downloaded and renamed to 'attendance.xlsx'`);
        } else {
            console.error('Could not find the downloaded file. The download might have failed or the file was not an Excel file.');
        }

    } catch (error) {
        console.error('An error occurred during the automation process:', error);
    } finally {
        await browser.close();
        console.log('Browser closed.');
    }
}

downloadAttendanceReport();

