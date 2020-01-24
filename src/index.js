#!/usr/bin/env node

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

function labelInfoToParams(labelInfo, presets, lastEntry) {
    const preset = labelInfo.preset ? presets[labelInfo.preset] : {};
    const align = labelInfo.align || preset.align || A.HALIGN.CENTER;
    const verticalAlign = labelInfo.verticalAlign || preset.verticalAlign || A.VALIGN.MIDDLE;
    const continuation = labelInfo.continuation || preset.continuation || false;
    const geometry = continuation ? {} : {
        align,
        verticalAlign,
        x: labelInfo.x || preset.x || A.COORDS.HALIGN[align],
        y: labelInfo.y || preset.y || A.COORDS.VALIGN[verticalAlign],
        width: labelInfo.width || preset.width || null,
        lineGap: labelInfo.lineGap || preset.lineGap || 0
    };
    return {
        continuation,
        font: labelInfo.font || preset.font || continuation && lastEntry.font,
        fontSize: labelInfo.fontSize || preset.fontSize || continuation && lastEntry.fontSize,
        label: labelInfo.label || preset.label,
        ...geometry
    };
}

function outputBlock(doc, block) {
    const totalWidth = block.labels.reduce((p, l) => p + l.effectiveWidth, 0);
    let x = {
        [A.HALIGN.LEFT]: block.x,
        [A.HALIGN.CENTER]: block.x - totalWidth / 2,
        [A.HALIGN.RIGHT]: block.x - totalWidth
    }[block.align];
    for (const {label, font, fontSize, effectiveWidth, effectiveHeight} of block.labels) {
        const y = {
            [A.VALIGN.TOP]: block.y,
            [A.VALIGN.MIDDLE]: block.y - effectiveHeight / 2,
            [A.VALIGN.BOTTOM]: block.y - effectiveHeight
        }[block.verticalAlign];
        doc.font(font).fontSize(fontSize);
        doc.text(label, x, y, {width: effectiveWidth, ...block.extraParams});
        x += effectiveWidth;
    }
}

function createDoc(text, format, presets) {
    const doc = new PDFDocument(format);
    const blocks = [];
    let lastParams = null;
    for (let i = 0; i < text.length; i++) {
        lastParams = labelInfoToParams(text[i], presets, lastParams);
        const {continuation, font, fontSize, label, align, verticalAlign, x, y, width, lineGap} = lastParams;
        doc.font(font).fontSize(fontSize);
        const extraParams = {lineGap: lineGap * doc.page.height};
        const actualWidth = doc.widthOfString(label, extraParams);
        const effectiveWidth = width ? Math.min(width * doc.page.width, actualWidth) : actualWidth;
        const effectiveHeight = doc.heightOfString(label, {width: effectiveWidth, ...extraParams});
        const labelParams = {label, font, fontSize, effectiveWidth, effectiveHeight};
        if (continuation) {
            blocks[blocks.length - 1].labels.push(labelParams);
        } else {
            blocks.push({
                align, verticalAlign, x: x * doc.page.width, y: y * doc.page.height, extraParams,
                labels: [labelParams]
            });
        }
    }
    blocks.forEach(block => outputBlock(doc, block));
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