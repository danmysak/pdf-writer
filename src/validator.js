const fs = require('fs');
const nonvalid = require('nonvalid');

module.exports = (json, hAlign, vAlign) => {
    const nv = nonvalid.instance();

    const nUnexpectedKey = noun => () => `Unexpected ${noun}: "${nv.key()}"`;
    const nPositiveNumber = () => !nv.number() || nv.value() <= 0;
    const nScalableNumber = () => !nv.number() || nv.value() < 0 || nv.value() > 1;

    const nDefinedInFormatPreset = () => !nv.defined() && !nv.defined(() => nv.root().format[nv.key()])
      && `"${nv.key()}" is not defined for a file`;

    const nDefinedInTextPreset = () => !nv.defined()
      && !nv.defined(() => nv.root().textPresets[nv.up().preset][nv.key()])
      && `"${nv.key()}" is not defined for a text label`;

    const nTextOptions = preset => () => nv({
        preset: v => preset && nv.defined() && 'Cannot set "preset" for another preset'
          || !preset && nv.defined() && (!nv.string() && '"preset" must be a preset name'
            || !nv.defined(() => nv.root().textPresets[v]) && `Preset not found: "${v}"`),
        font: v => nv.defined() && (
          !nv.string() && 'Expected "font" to be a string' ||
          !fs.existsSync(v) && `File does not exist: ${v}` ||
          !fs.lstatSync(v).isFile() && `Path is not a file: ${v}`
        ) || !preset && nDefinedInTextPreset(),
        fontSize: v => nv.defined() && nPositiveNumber() && 'Expected "fontSize" to be a positive number'
          || !preset && nDefinedInTextPreset(),
        label: v => nv.defined() && !nv.string() && 'Expected "label" to be a string'
          || !preset && nDefinedInTextPreset(),
        align: v => nv.defined() && !hAlign.includes(v)
          && `Expected "align" to be one of "${hAlign.join('", "')}", got "${v}"`,
        verticalAlign: v => nv.defined() && !vAlign.includes(v)
          && `Expected "verticalAlign" to be one of "${vAlign.join('", "')}", got "${v}"`,
        x: v => nv.defined() && nScalableNumber() && 'Expected "x" to be a number between 0 and 1',
        y: v => nv.defined() && nScalableNumber() && 'Expected "y" to be a number between 0 and 1',
        width: v => nv.defined() && nPositiveNumber() && 'Expected "width" to be a positive number',
        [nv.other]: nUnexpectedKey('option'),
        [nv.error]: `Expected ${preset ? 'preset' : 'each "text" item'} to be an object`
    });

    const nSize = preset => () => nv.defined() && nPositiveNumber() && `Expected "${nv.key()}" to be a positive number`
      || !preset && nDefinedInFormatPreset();
    const nFormatOptions = (preset, v) => nv.defined(v) && nv(v, {
        width: nSize(preset),
        height: nSize(preset),
        [nv.other]: nUnexpectedKey('format property'),
        [nv.error]: 'Expected "format" to be an object'
    });

    return [nv(json, {
        format: v => nFormatOptions(true, v),
        textPresets: v => nv.defined() && nv({
            [nv.other]: nTextOptions(true)
        }),
        files: v => !nv.defined() && 'Missing "files" list' || nv([nv.end, v => nv({
            format: v => nFormatOptions(false, nv.defined(v) ? v : {}),
            text: v => nv.defined() && nv([nv.end, nTextOptions(false), 'Expected "text" to be an array']),
            output: v => !nv.defined() && 'Missing "output"' || !nv.string() && 'Expected "output" to be a file path',
            postprocess: v => nv.defined() && !nv.string() && 'Expected "postprocess" to be a CLI command',
            [nv.other]: nUnexpectedKey('property'),
            [nv.error]: 'Expected each element of "files" to be an object'
        }), 'Expected "files" to be an array']),
        [nv.other]: nUnexpectedKey('property'),
        [nv.error]: 'Expected JSON to be an object'
    }), nv.errorPath('json')];
};