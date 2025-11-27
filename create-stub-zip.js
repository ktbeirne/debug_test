const AdmZip = require('adm-zip');
const fs = require('fs');
const path = require('path');

// Create a new zip file
const zip = new AdmZip();

// Add the Python Lambda function
const lambdaPath = path.join(__dirname, 'src', 'lambda', 'stub-api', 'lambda_function.py');

if (fs.existsSync(lambdaPath)) {
    zip.addLocalFile(lambdaPath);

    // Write the zip file
    const outputPath = path.join(__dirname, 'stub-api-lambda.zip');
    zip.writeZip(outputPath);

    const stats = fs.statSync(outputPath);
    console.log(`✅ Stub API ZIP created: ${outputPath} (${Math.round(stats.size / 1024)}KB)`);
} else {
    console.error('❌ Error: src/lambda/stub-api/lambda_function.py not found.');
    process.exit(1);
}
