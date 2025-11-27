const AdmZip = require('adm-zip');
const fs = require('fs');
const path = require('path');

// Create a new zip file
const zip = new AdmZip();

// Add the compiled Lambda function
const lambdaPath = path.join(__dirname, 'dist', 'lambda', 'sample-app', 'index.js');

if (fs.existsSync(lambdaPath)) {
    zip.addLocalFile(lambdaPath);

    // Write the zip file
    const outputPath = path.join(__dirname, 'sample-app-lambda.zip');
    zip.writeZip(outputPath);

    const stats = fs.statSync(outputPath);
    console.log(`✅ ZIP created: ${outputPath} (${Math.round(stats.size / 1024)}KB)`);
} else {
    console.error('❌ Error: dist/lambda/sample-app/index.js not found. Run npm run build first.');
    process.exit(1);
}
