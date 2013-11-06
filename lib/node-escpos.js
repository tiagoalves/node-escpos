"use strict";

var net = require('net');
var util = require('util');
var serialport = require('serialport');
var Iconv = require('iconv').Iconv;
var SerialPort = serialport.SerialPort;

var controlCodes = {
    NUL: String.fromCharCode(0),
    EOT: String.fromCharCode(4),
    ENQ: String.fromCharCode(5),
    HT: String.fromCharCode(9),
    LF: String.fromCharCode(10),
    FF: String.fromCharCode(12),
    CR: String.fromCharCode(13),
    DLE: String.fromCharCode(16),
    DC4: String.fromCharCode(20),
    CAN: String.fromCharCode(24),
    ESC: String.fromCharCode(27),
    FS: String.fromCharCode(28),
    GS: String.fromCharCode(29)
};

var escPosCommands = {
    hwInit: "\x1b\x40"
};

var centerText = function(txt, lineWidth) {
    if (txt.length < lineWidth - 2) {
        var pad = "";
        var nbSpaces = (lineWidth - txt.length) / 2;
        for (var i = 0; i < nbSpaces; i++) {
            pad += " ";
        }
        return pad + txt;
    } else {
        return txt;
    }
};

/**
 * The base constructor for EscPos devices.
 * 
 * @param {*} path         The path to the serial port or an object for
 *                         the Ethernet connection with these properties:
 *                         - host
 *                         - port
 *                         
 * @param {object} options The options object to pass to the SerialPort
 */
function EscPos(path, options) {
    var self = this;
    if (typeof path === 'object') {
        var socket = net.createConnection(path);
        this.write = socket.write.bind(socket);
        this.close = socket.destroy.bind(socket);
        socket.on('data', function (data) {
            self.emit('data', data);
        });
        socket.on('connect', function () {
            self.write(escPosCommands.hwInit);
            self.emit('ready');
        });
    } else {
        serialport.SerialPort.call(this, path, options);
    }

    // Serial Connection
    this.on('open', function() {
        self.write(escPosCommands.hwInit);
        self.emit('ready');
    });
}
util.inherits(EscPos, serialport.SerialPort);
util.inherits(EscPos, net.Socket);

EscPos.prototype.text = function(txt) {
    var iconv = new Iconv('UTF-8', 'CP437//TRANSLIT//IGNORE');
    var buffer = iconv.convert(txt);
    this.write(buffer);
};

/****************************************************
 * 
 * ESC/POS SFD DISPLAY STUFF
 * 
 ****************************************************/
var escPosVfdCommands = {
    moveCursorRight: "\x09",
    moveCursorLeft: "\x08",
    moveCursorUp: "\x1F\x0A",
    moveCursorDown: "\x0A",
    moveCursorRightMostPosition: "\x1F\x0D",
    moveCursorLeftMostPosition: "\x0D",
    moveCursorHomePosition: "\x0B",
    moveCursorBottomPosition: "\x1F\x42",
    cursorGoto: "\x1F\x24", // 1F 24 x y (1 <= x <= 20; 1 <= y <= 2)
    cursorDisplay: "\x1f\x43", // 1F 43 n (n=0, hide; n=1, show)
    clearScreen: "\x0C",
    clearCursorLine: "\x18",
    brightness: "\x1F\x58", // 1F 58 n (1 <= n <= 4)
    blinkDisplay: "\x1F\x45" // 1F 45 n (0 < n < 255 (n*50msec ON / n*50msec OFF; n=0, blink canceled; n=255, display turned off)
};

function EscPosDisplay(path, options) {
    EscPos.call(this, path, options);
}
util.inherits(EscPosDisplay, EscPos);

EscPosDisplay.prototype.showCursor = function(v) {
    if (v === true) {
        this.write(escPosVfdCommands.cursorDisplay + String.fromCharCode(1));
    } else {
        this.write(escPosVfdCommands.cursorDisplay + String.fromCharCode(0));
    }
};

EscPosDisplay.prototype.centeredUpperLine = function(txt) {
    this.write(escPosVfdCommands.moveCursorHomePosition);
    this.write(escPosVfdCommands.clearCursorLine);
    this.text(centerText(txt, 20));
};

EscPosDisplay.prototype.centeredBottomLine = function(txt) {
    this.write(escPosVfdCommands.moveCursorBottomPosition);
    this.write(escPosVfdCommands.clearCursorLine);
    this.text(centerText(txt, 20));
};

/****************************************************
 * 
 * ESC/POS PRINTER STUFF
 * 
 ****************************************************/
var escPosPrinterCommands = {
    // Paper Cutting
    paperFullCut: "\x1d\x56\x00", // Full paper cut
    paperPartCut: "\x1d\x56\x01", // Partial paper cut
    // Text/Font Formatting
    txtNormal: "\x1b\x21\x00", // Normal text
    txt2Height: "\x1b\x21\x10", // Double height text
    txt2Width: "\x1b\x21\x20", // Double width text
    txtUnderlOff: "\x1b\x2d\x00", // Underline font OFF
    txtUnderlOn: "\x1b\x2d\x01", // Underline font 1-dot ON
    txtUnderl2On: "\x1b\x2d\x02", // Underline font 2-dot ON
    txtBoldOff: "\x1B\x45\x00", // Bold font OFF
    txtBoldOn: "\x1B\x45\x01", // Bold font ON
    txtFontA: "\x1b\x4d\x00", // Font type A
    txtFontB: "\x1b\x4d\x01", // Font type B
    txtAlignLt: "\x1b\x61\x00", // Left justification
    txtAlignCt: "\x1b\x61\x01", // Centering
    txtAlignRight: "\x1b\x61\x02", // Right justification
    // Printer Status
    transmitDlePrinterStatus: "\x10\x04\x01",
    transmitDleOfflinePrinterStatus: "\x10\x04\x02",
    transmitDleErrorStatus: "\x10\x04\x03",
    transmitDleRollPaperSensorStatus: "\x10\x04\x04",  // Get the paper roll status
    // Barcode format
    barcodeTxtOff: "\x1d\x48\x00", // HRI barcode chars OFF
    barcodeTxtAbv: "\x1d\x48\x01", // HRI barcode chars above
    barcodeTxtBlw: "\x1d\x48\x02", // HRI barcode chars below
    barcodeTxtBth: "\x1d\x48\x03", // HRI barcode chars both above and below
    barcodeFontA: "\x1d\x66\x00", // Font type A for HRI barcode chars
    barcodeFontB: "\x1d\x66\x01", // Font type B for HRI barcode chars
    barcodeHeight: "\x1d\x68\x64", // Barcode Height [1-255]
    barcodeWidth: "\x1d\x77\x03", // Barcode Width  [2-6]
    barcodeUpcA: "\x1d\x6b\x00", // Barcode type UPC-A
    barcodeUpcE: "\x1d\x6b\x01", // Barcode type UPC-E
    barcodeEan13: "\x1d\x6b\x02", // Barcode type EAN13
    barcodeEan8: "\x1d\x6b\x03", // Barcode type EAN8
    barcodeCode39: "\x1d\x6b\x04", // Barcode type CODE39
    barcodeItf: "\x1d\x6b\x05", // Barcode type ITF
    barcodeNw7: "\x1d\x6b\x06", // Barcode type NW7
    barcodeCode128: "\x1d\x6b\x49", // Barcode type CODE128
    barcodeCode128B: "\x7b\x42", // Code128 character set B
    // Image format  
    sRasterN: "\x1d\x76\x30\x00", // Set raster image normal size
    sRaster2W: "\x1d\x76\x30\x01", // Set raster image double width
    sRaster2H: "\x1d\x76\x30\x02", // Set raster image double height
    sRasterQ: "\x1d\x76\x30\x03", // Set raster image quadruple
};

var escPosPrinterStatus = {
    // hex values
    error: '0',
    ok: '12',
    noPaper: '1e'
};

function EscPosPrinter(path, options) {
    EscPos.call(this, path, options);
}
util.inherits(EscPosPrinter, EscPos);

EscPosPrinter.prototype.printLine = function(txt) {
    this.text(txt + "\n\r");
};

EscPosPrinter.prototype.printCentered = function(txt) {
    this.text(centerText(txt, 40) + "\n\r");
};

EscPosPrinter.prototype.printCenteredLen = function(txt, len) {
    this.text(centerText(txt, len) + "\n\r");
};

EscPosPrinter.prototype.printCommand = function(txt) {
    this.write(txt);
};

/**
 * Get the status of the printer's paper roll.
 * 
 * @param  {string}   [encoding] A valid Buffer encoding type. Default: 'hex'.
 * @param  {Function} callback   The function to call with the paper status code.
 *                               Check `EscPosPrinterStatus` for the possible status codes.
 *                               function (statusCode)
 * @return {undefined}
 */
EscPosPrinter.prototype.getPaperStatus = function(encoding, callback) {
    var self = this;
    if (typeof encoding === 'function') {
        callback = encoding;
        encoding = 'hex';
    }
    var paperStatusHandler = function (data) {
        self.removeListener('data', paperStatusHandler);
        callback(data.toString(encoding));
    };
    this.on('data', paperStatusHandler);
    this.write(escPosPrinterCommands.transmitDleRollPaperSensorStatus);
};

module.exports.EscPosDisplay = EscPosDisplay;
module.exports.EscPosPrinter = EscPosPrinter;
module.exports.EscPosPrinterStatus = escPosPrinterStatus;