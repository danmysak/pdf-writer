const HALIGN = {
  LEFT: 'left',
  CENTER: 'center',
  RIGHT: 'right'
};

const VALIGN = {
  TOP: 'top',
  MIDDLE: 'middle',
  BOTTOM: 'bottom'
};

const COORDS = {
  HALIGN: {
    [HALIGN.LEFT]: 0,
    [HALIGN.CENTER]: 0.5,
    [HALIGN.RIGHT]: 1
  },
  VALIGN: {
    [VALIGN.TOP]: 0,
    [VALIGN.MIDDLE]: 0.5,
    [VALIGN.BOTTOM]: 1
  }
};

module.exports = {HALIGN, VALIGN, COORDS};