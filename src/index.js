const yargs = require('yargs');
const fs = require('fs');
const path = require('path');
const exec = require('child_process').exec;
const PDFDocument = require('pdfkit');
const validate = require('./validator');
const A = require('./alignments');

function quit(...message) {
    console.error(...message);
    process.exit(1);
}

function readJson() {
    if (yargs.argv._.length !== 1) {
        quit('Exactly one parameter is expected: the path to a JSON file');
    }
    const jsonPath = yargs.argv._[0];
    if (!fs.existsSync(jsonPath)) {
        quit(`File does not exist: ${jsonPath}`);
    }
    if (!fs.lstatSync(jsonPath).isFile(jsonPath)) {
        quit(`Path is not a file: ${jsonPath}`);
    }
    const contents = fs.readFileSync(jsonPath);
    process.chdir(path.dirname(jsonPath));
    let json;
    try {
        json = JSON.parse(contents);
    } catch (e) {
        quit(`The provided file is not valid JSON: ${jsonPath}`);
    }
    const [error, errorPath] = validate(json, Object.values(A.HALIGN), Object.values(A.VALIGN));
    if (error) {
        quit(`${error}\nat ${errorPath}`);
    }
    return json;
}

function formatToPdfKit(format) {
    const c = 72 / 25.4;
    return {
        size: [c * Math.min(format.width, format.height), c * Math.max(format.width, format.height)],
        layout: format.width < format.height ? 'portrait' : 'landscape',
        margin: 0
    };
}

function createDoc(text, format, presets) {
    const doc = new PDFDocument(format);
    for (const labelInfo of text) {
        const preset = labelInfo.preset ? presets[labelInfo.preset] : {};
        const font = labelInfo.font || preset.font;
        const fontSize = labelInfo.fontSize || preset.fontSize;
        const label = labelInfo.label || preset.label;
        const align = labelInfo.align || preset.align || A.HALIGN.CENTER;
        const verticalAlign = labelInfo.verticalAlign || preset.verticalAlign || A.VALIGN.MIDDLE;
        const x = labelInfo.x || preset.x || A.COORDS.HALIGN[align];
        const y = labelInfo.y || preset.y || A.COORDS.VALIGN[verticalAlign];
        const width = labelInfo.width || preset.width || null;
        doc.fontSize(fontSize).font(font);
        const scaledX = x * doc.page.width, scaledY = y * doc.page.height;
        const scaledWidth = width === null ? null : width * doc.page.width;
        let x0, x1, y0;
        switch (align) {
            case A.HALIGN.LEFT:
                x0 = scaledX;
                x1 = doc.page.width;
                break;
            case A.HALIGN.RIGHT:
                x0 = 0;
                x1 = scaledX;
                break;
            case A.HALIGN.CENTER:
                const actualWidth = scaledWidth || 2 * Math.min(scaledX, doc.page.width - scaledX);
                x0 = scaledX - actualWidth / 2;
                x1 = scaledX + actualWidth / 2;
                break;
        }
        const actualHeight = doc.heightOfString(label, {width: x1 - x0});
        switch (verticalAlign) {
            case A.VALIGN.TOP:
                y0 = scaledY;
                break;
            case A.VALIGN.BOTTOM:
                y0 = scaledY - actualHeight;
                break;
            case A.VALIGN.MIDDLE:
                y0 = scaledY - actualHeight / 2;
                break;
        }
        doc.text(label, x0, y0, {align, width: x1 - x0});
    }
    doc.end();
    return doc;
}

async function go() {
    const json = readJson();
    const defaultFormat = json.format || {};
    const textPresets = json.textPresets || {};

    for (let index = 0; index < json.files.length; index++) {
        const fileInfo = json.files[index];
        console.log(`Processing file ${index + 1} of ${json.files.length}...`);
        const format = formatToPdfKit(Object.assign({}, defaultFormat, fileInfo.format || {}));
        const text = fileInfo.text || [];
        const output = fileInfo.output;
        const doc = createDoc(text, format, textPresets);
        try {
            await new Promise((resolve, reject) => {
                const stream = fs.createWriteStream(output);
                doc.pipe(stream);
                stream.on('error', error => reject(error));
                stream.on('finish', () => resolve());
            });
        } catch(e) {
            quit('An unexpected error has occurred:', e);
        }
        if ('postprocess' in fileInfo) {
            console.log('Postprocessing...');
            try {
                await new Promise((resolve, reject) => {
                    exec(fileInfo.postprocess.replace(/\$output\b/g, output), error => {
                        if (error) {
                            reject(error);
                        } else {
                            resolve();
                        }
                    });
                });
            } catch(e) {
                quit('An error has occurred while postprocessing:', e);
            }
        }
    }
    console.log('Done');
}

go();
