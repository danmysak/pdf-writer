const fs = require('fs');
const nonvalid = require('nonvalid');

module.exports = (json, hAlign, vAlign) => {
    const nv = nonvalid.instance();

    const nUnexpectedKey = noun => () => `Unexpected ${noun}: "${nv.key()}"`;
    const nPositiveNumber = () => (!nv.number() || nv.value() <= 0) && `Expected "${nv.key()}" to be a positive number`;
    const nScalableNumber = () => (!nv.number() || nv.value() < 0 || nv.value() > 1)
      && `Expected "${nv.key()}" to be a number between 0 and 1`;

    const nDefinedInFormatPreset = () => !nv.defined() && !nv.defined(() => nv.root().format[nv.key()])
      && `"${nv.key()}" is not defined for a file`;

    const getFromTextPreset = field => () => nv.root().textPresets[nv.up().preset][field || nv.key()];

    const nDefinedInTextPreset = () => !nv.defined() && !nv.defined(getFromTextPreset())
      && `"${nv.key()}" is not defined for a text label`;

    const geometryOptions = {
        align: v => nv.defined() && !hAlign.includes(v)
          && `Expected "align" to be one of "${hAlign.join('", "')}", got "${v}"`,
        verticalAlign: v => nv.defined() && !vAlign.includes(v)
          && `Expected "verticalAlign" to be one of "${vAlign.join('", "')}", got "${v}"`,
        x: v => nv.defined() && nScalableNumber(),
        y: v => nv.defined() && nScalableNumber(),
        width: v => nv.defined() && (nScalableNumber() || nPositiveNumber()),
        lineGap: v => nv.defined() && nScalableNumber()
    };

    const nTextOptions = preset => () => nv({
        preset: v => preset && nv.defined() && 'Cannot set "preset" for another preset'
          || !preset && nv.defined() && (!nv.string() && '"preset" must be a preset name'
            || !nv.defined(() => nv.root().textPresets[v]) && `Preset not found: "${v}"`),
        font: v => nv.defined() && (
          !nv.string() && 'Expected "font" to be a string' ||
          !fs.existsSync(v) && `File does not exist: ${v}` ||
          !fs.lstatSync(v).isFile() && `Path is not a file: ${v}`
        ) || !preset && !nv.up().continuation && !nv.get(getFromTextPreset('continuation')) && nDefinedInTextPreset(),
        fontSize: v => nv.defined() && nPositiveNumber()
          || !preset && !nv.up().continuation && !nv.get(getFromTextPreset('continuation')) && nDefinedInTextPreset(),
        label: v => nv.defined() && !nv.string() && 'Expected "label" to be a string'
          || !preset && nDefinedInTextPreset(),
        continuation: v => {
            if (nv.defined() && v !== true) {
                return 'Expected "continuation" to be either true or undefined';
            }
            const combinedError = '"continuation" cannot be combined with any of the geometry parameters';
            if (preset) {
                if (nv.defined() && Object.keys(geometryOptions).some(key => nv.defined(nv.up()[key]))) {
                    return combinedError;
                }
            } else {
                if (v || nv.get(getFromTextPreset())) {
                    const index = nv.path().slice(-2)[0];
                    if (index === 0) {
                        return 'First element of a list cannot be a "continuation"';
                    }
                    const previous = nv.up(1)[index - 1];
                    if (nv.defined(previous.width) || nv.defined(previous.lineGap)) {
                        return 'Cannot continue a label with set width or lineGap'
                          + ' (only single-line continuation is supported)';
                    }
                    if (Object.keys(geometryOptions).some(key => nv.defined(nv.up()[key])
                      || nv.defined(getFromTextPreset(key)))) {
                        return combinedError;
                    }
                }
            }
        },
        ...geometryOptions,
        [nv.other]: nUnexpectedKey('option'),
        [nv.error]: `Expected ${preset ? 'preset' : 'each "text" item'} to be an object`
    });

    const nSize = preset => () => nv.defined() && nPositiveNumber() || !preset && nDefinedInFormatPreset();
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