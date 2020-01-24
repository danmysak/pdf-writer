# PDF Writer

This script generates text-only PDFs by reading configuration from a JSON file. It can also overlay text on existing PDFs using [QPDF](http://qpdf.sourceforge.net/).

## Installation and usage

```shell script
npm i -g pdf-writer
pdf-writer <path to a JSON file>
```

## JSON format

See `example/example.json` for reference.

A few notes:

- Width and height of a sheet are specified in millimeters.
- `x` and `width` are relative to the width of the page; `y` and `lineGap` are relative to the height of the page.
- Default value for `align` is `center` and for `verticalAlign` is `middle`: you don’t need to specify them explicitly.
- `continuation` only works for single-line labels.

This script uses [QPDF](http://qpdf.sourceforge.net/) for overlaying text on existing PDFs. An example of how to achieve this can be found in the example file: see the line with the `postprocess` configuration. If you don’t have QPDF installed, remove this line in order to be able to run the example.