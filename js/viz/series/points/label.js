"use strict";

var _format = require("../../core/format"),
    vizUtils = require("../../core/utils"),
    each = require("../../../core/utils/iterator").each,
    extend = require("../../../core/utils/extend").extend,
    _degreesToRadians = vizUtils.degreesToRadians,
    _patchFontOptions = vizUtils.patchFontOptions,
    _math = Math,
    _round = _math.round,
    _floor = _math.floor,
    _abs = _math.abs,
    _getCosAndSin = vizUtils.getCosAndSin,
    _rotateBBox = vizUtils.rotateBBox,

    CONNECTOR_LENGTH = 12,
    LABEL_BACKGROUND_PADDING_X = 8,
    LABEL_BACKGROUND_PADDING_Y = 4;

function getClosestCoord(point, coords) {
    var closestDistance = Infinity,
        closestCoord;
    each(coords, function(_, coord) {
        var x = point[0] - coord[0],
            y = point[1] - coord[1],
            distance = x * x + y * y;
        if(distance < closestDistance) {
            closestDistance = distance;
            closestCoord = coord;
        }
    });

    return [_floor(closestCoord[0]), _floor(closestCoord[1])];
}

// We could always conside center of label as label point (with appropriate connector path clipping). In that case we do not depend neither on background nor on rotation.

var barPointStrategy = {
    isLabelInside: function(labelPoint, figure) {
        var xc = labelPoint.x + labelPoint.width / 2,
            yc = labelPoint.y + labelPoint.height / 2;
        return figure.x <= xc && xc <= figure.x + figure.width && figure.y <= yc && yc <= figure.y + figure.height;
    },

    prepareLabelPoints: function(bBox, rotatedBBox, isRotated, angle) {
        var x1 = rotatedBBox.x,
            xc = x1 + rotatedBBox.width / 2,
            x2 = x1 + rotatedBBox.width - 1,
            y1 = rotatedBBox.y,
            yc = y1 + rotatedBBox.height / 2,
            y2 = y1 + rotatedBBox.height - 1;

        return (_abs(angle) % 90) === 0 ? [
            [x1, y1],
            [isRotated ? x1 : xc, isRotated ? yc : y1],
            [x2, y1],

            [x1, y2],
            [isRotated ? x2 : xc, isRotated ? yc : y2],
            [x2, y2]
        ] :
            [[xc, yc]];
    },

    isRotated: function(bBox, figure) {
        return (bBox.x > figure.x + figure.width) || (bBox.x + bBox.width < figure.x);
    },

    getFigureCenter: function(figure) {
        return [_floor(figure.x + figure.width / 2), _floor(figure.y + figure.height / 2)];
    },

    findFigurePoint: function(figure, labelPoint) {
        var figureCenter = barPointStrategy.getFigureCenter(figure),
            point = getClosestCoord(labelPoint, [
                [figure.x, figureCenter[1]],
                [figureCenter[0], figure.y + figure.height],
                [figure.x + figure.width, figureCenter[1]],
                [figureCenter[0], figure.y]
            ]);
        return point;
    },

    adjustPoints: function(points) {
        var lineIsVertical = _abs(points[1] - points[3]) <= 1,
            lineIsHorizontal = _abs(points[0] - points[2]) <= 1;

        if(lineIsHorizontal) {
            points[0] = points[2];
        }
        if(lineIsVertical) {
            points[1] = points[3];
        }
        return points;
    }
};

var symbolPointStrategy = {
    isLabelInside: function() {
        return false;
    },

    prepareLabelPoints: barPointStrategy.prepareLabelPoints,

    isRotated: function(bBox, figure) {
        return (bBox.x > figure.x + figure.r) || (bBox.x + bBox.width < figure.x - figure.r);
    },

    getFigureCenter: function(figure) {
        return [figure.x, figure.y];
    },

    findFigurePoint: function(figure, labelPoint) {
        var angle = Math.atan2(figure.y - labelPoint[1], labelPoint[0] - figure.x);
        return [_round(figure.x + figure.r * Math.cos(angle)), _round(figure.y - figure.r * Math.sin(angle))];
    },

    adjustPoints: barPointStrategy.adjustPoints
};

var piePointStrategy = {
    isLabelInside: function(_0, _1, isOutside) {
        return !isOutside;
    },

    prepareLabelPoints: function(bBox, rotatedBBox, isRotated, angle) {
        var xl = bBox.x,
            xr = xl + bBox.width,
            xc = xl + bBox.width / 2,
            yt = bBox.y,
            yb = yt + bBox.height,
            yc = yt + bBox.height / 2,
            points = [
                [[xl, yt], [xr, yt]],
                [[xr, yt], [xr, yb]],
                [[xr, yb], [xl, yb]],
                [[xl, yb], [xl, yt]]
            ],
            cosSin = _getCosAndSin(angle);

        if(angle === 0) {
            points = [
                [xl, yc],
                [xr, yc]
            ];
        } else {
            points = points.map(function(pair) {
                return pair.map(function(point) {
                    return [
                        _round(((point[0] - xc) * cosSin.cos + (point[1] - yc) * cosSin.sin) + xc),
                        _round((-(point[0] - xc) * cosSin.sin + (point[1] - yc) * cosSin.cos) + yc)
                    ];
                });
            }).reduce(function(r, pair) {
                var point1x = pair[0][0],
                    point1y = pair[0][1],
                    point2x = pair[1][0],
                    point2y = pair[1][1];

                if((point1y >= yc && yc >= point2y) || (point1y <= yc && yc <= point2y)) {
                    r.push([(yc - point1y) * (point2x - point1x) / (point2y - point1y) + point1x, yc]);
                }
                return r;
            }, []);
        }
        return points;
    },

    isRotated: function() { return false; },

    getFigureCenter: symbolPointStrategy.getFigureCenter,

    findFigurePoint: function(figure, labelPoint, position, bBox, maxLabelLength) {
        var labelX = labelPoint[0],
            connector = CONNECTOR_LENGTH + (position === "columns" ? maxLabelLength - bBox.width : 0),
            offset = _abs(figure.x - labelX) >= connector ? connector : 0,
            x = _round(figure.x + (figure.y - labelPoint[1]) / Math.tan(_degreesToRadians(figure.angle)));

        if(!(figure.x <= x && x <= labelX) && !(labelX <= x && x <= figure.x)) {
            if(figure.x <= labelX) {
                x = labelX - offset;
            } else {
                x = labelX + offset;
            }
        }
        return [figure.x, figure.y, x, labelPoint[1]];
    },

    adjustPoints: function(points) {
        return points;
    }
};

function selectStrategy(figure) {
    return (figure.angle !== undefined && piePointStrategy) || (figure.r !== undefined && symbolPointStrategy) || barPointStrategy;
}

function disposeItem(obj, field) {
    obj[field] && obj[field].dispose();
    obj[field] = null;
}

function checkBackground(background) {
    return background && ((background.fill && background.fill !== "none") || (background["stroke-width"] > 0 && background.stroke && background.stroke !== "none"));
}

function checkConnector(connector) {
    return connector && connector["stroke-width"] > 0 && connector.stroke && connector.stroke !== "none";
}

function formatText(data, options) {
    data.valueText = _format(data.value, options);
    data.argumentText = _format(data.argument, { format: options.argumentFormat, precision: options.argumentPrecision /* DEPRECATED_16_1 */ });
    if(data.percent !== undefined) {
        data.percentText = _format(data.percent, { format: { type: "percent", precision: (options.format && options.format.percentPrecision) || options.percentPrecision /* DEPRECATED_16_1 */ } });
    }
    if(data.total !== undefined) {
        data.totalText = _format(data.total, options);
    }
    if(data.openValue !== undefined) {
        data.openValueText = _format(data.openValue, options);
    }
    if(data.closeValue !== undefined) {
        data.closeValueText = _format(data.closeValue, options);
    }
    if(data.lowValue !== undefined) {
        data.lowValueText = _format(data.lowValue, options);
    }
    if(data.highValue !== undefined) {
        data.highValueText = _format(data.highValue, options);
    }
    if(data.reductionValue !== undefined) {
        data.reductionValueText = _format(data.reductionValue, options);
    }

    return options.customizeText ? options.customizeText.call(data, data) : data.valueText;
}

function Label(renderSettings) {
    this._renderer = renderSettings.renderer;
    this._container = renderSettings.labelsGroup;
    this._point = renderSettings.point;
    this._strategy = renderSettings.strategy;
}

Label.prototype = {
    constructor: Label,

    setColor: function(color) {
        this._color = color;
    },

    setOptions: function(options) {
        this._options = options;
    },

    setData: function(data) {
        this._data = data;
    },

    setDataField: function(fieldName, fieldValue) {
        // Is this laziness really required?
        this._data = this._data || {};
        this._data[fieldName] = fieldValue;
    },

    getData: function() {
        return this._data;
    },

    setFigureToDrawConnector: function(figure) {
        this._figure = figure;
    },

    dispose: function() {
        var that = this;
        disposeItem(that, "_group");
        that._data = that._options = that._textContent = that._visible = that._insideGroup = that._text = that._background = that._connector = that._figure = null;
    },

    // The following method is required because we support partial visibility for labels
    // entire labels group can be hidden and any particular label can be visible at the same time
    // in order to do that label must have visibility:"visible" attribute
    _setVisibility: function(value, state) {
        this._group && this._group.attr({ visibility: value });
        this._visible = state;
    },

    isVisible: function() {
        return this._visible;
    },

    hide: function(holdInvisible) {
        this._holdVisibility = !!holdInvisible;
        this._hide();
    },

    _hide: function() {
        this._setVisibility("hidden", false);
    },

    show: function(holdVisible) {
        var correctPosition = !this._drawn;
        if(this._point.hasValue()) {
            this._holdVisibility = !!holdVisible;
            this._show();
            correctPosition && this._point.correctLabelPosition(this);
        }
    },

    _show: function() {
        var that = this,
            renderer = that._renderer,
            container = that._container,
            options = that._options || {},
            text = that._textContent = formatText(that._data, that._options) || null;

        if(text) {
            if(!that._group) {
                that._group = renderer.g().append(container);
                that._insideGroup = renderer.g().append(that._group);
                that._text = renderer.text("", 0, 0).append(that._insideGroup);
            }
            that._text.css(options.attributes ? _patchFontOptions(options.attributes.font) : {});

            if(checkBackground(options.background)) {
                that._background = that._background || renderer.rect().append(that._insideGroup).toBackground();
                that._background.attr(options.background);
                // The following is because "this._options" is shared between all labels and so cannot be modified
                that._color && that._background.attr({ fill: that._color });
            } else {
                disposeItem(that, "_background");
            }

            if(checkConnector(options.connector)) {
                that._connector = that._connector || renderer.path([], "line").sharp().append(that._group).toBackground();
                that._connector.attr(options.connector);
                // The following is because "this._options" is shared between all labels and so cannot be modified
                that._color && that._connector.attr({ stroke: that._color });
            } else {
                disposeItem(that, "_connector");
            }

            that._text.attr({ text: text, align: options.textAlignment });
            that._updateBackground(that._text.getBBox());
            that._setVisibility("visible", true);
            that._drawn = true;
        } else {
            that._hide();
        }
    },

    _getLabelVisibility: function(isVisible) {
        return this._holdVisibility ? this.isVisible() : isVisible;
    },

    draw: function(isVisible) {
        if(this._getLabelVisibility(isVisible)) {
            this._show();
            this._point && this._point.correctLabelPosition(this);
        } else {
            this._drawn = false;
            this._hide();
        }
        return this;
    },

    _updateBackground: function(bBox) {
        var that = this;

        if(that._background) {
            bBox.x -= LABEL_BACKGROUND_PADDING_X;
            bBox.y -= LABEL_BACKGROUND_PADDING_Y;
            bBox.width += 2 * LABEL_BACKGROUND_PADDING_X;
            bBox.height += 2 * LABEL_BACKGROUND_PADDING_Y;
            that._background.attr(bBox);
        }
        that._bBoxWithoutRotation = extend({}, bBox);

        if(that._options.rotationAngle) {
            that._insideGroup.rotate(that._options.rotationAngle, bBox.x + bBox.width / 2, bBox.y + bBox.height / 2);
            // Angle is transformed from svg to right-handed cartesian space
            bBox = _rotateBBox(bBox, [bBox.x + bBox.width / 2, bBox.y + bBox.height / 2], -that._options.rotationAngle);
        }
        that._bBox = bBox;
    },

    _getConnectorPoints: function() {
        var that = this,
            figure = that._figure,
            options = that._options,
            strategy = that._strategy || selectStrategy(figure),
            bBox = that._shiftBBox(that._bBoxWithoutRotation),
            rotatedBBox = that.getBoundingRect(),
            labelPoint,
            points = [];

        if(!strategy.isLabelInside(bBox, figure, options.position !== "inside")) {
            points = strategy.prepareLabelPoints(bBox, rotatedBBox, strategy.isRotated(bBox, figure), -options.rotationAngle || 0);
            labelPoint = getClosestCoord(strategy.getFigureCenter(figure), points);
            points = strategy.findFigurePoint(figure, labelPoint, options.position, rotatedBBox, that._point ? that._point.getMaxLabelLength() : 0);
            points = points.concat(labelPoint);
        }
        return strategy.adjustPoints(points);
    },

    // TODO: Should not be called when not invisible (check for "_textContent" is to be removed)
    fit: function(maxWidth) {
        var padding = this._background ? 2 * LABEL_BACKGROUND_PADDING_X : 0;
        this._text && this._text.applyEllipsis(maxWidth - padding);
        this._updateBackground(this._text.getBBox());
    },

    resetEllipsis: function() {
        this._text && this._text.restoreText();
        this._updateBackground(this._text.getBBox());
    },

    setTrackerData: function(point) {
        this._text.data({ "chart-data-point": point });
        this._background && this._background.data({ "chart-data-point": point });
    },

    hideInsideLabel: function(coords) {
        return this._point.hideInsideLabel(this, coords);
    },

    // TODO: Should not be called when not invisible (check for "_textContent" is to be removed)
    shift: function(x, y) {
        var that = this;
        if(that._textContent) {
            that._insideGroup.attr({
                translateX: (that._x = _round(x - that._bBox.x)),
                translateY: (that._y = _round(y - that._bBox.y))
            });
            if(that._connector) {
                that._connector.attr({ points: that._getConnectorPoints() });
            }
        }
        return that;
    },

    // TODO: Should not be called when not invisible (check for "_textContent" is to be removed)
    getBoundingRect: function() {
        return this._shiftBBox(this._bBox);
    },

    _shiftBBox: function(bBox) {
        return this._textContent ? {
            x: bBox.x + this._x,
            y: bBox.y + this._y,
            width: bBox.width,
            height: bBox.height
        } : {};
    },

    getLayoutOptions: function() {
        var options = this._options;
        return {
            alignment: options.alignment,
            background: checkBackground(options.background),
            horizontalOffset: options.horizontalOffset,
            verticalOffset: options.verticalOffset,
            radialOffset: options.radialOffset,
            position: options.position,
            connectorOffset: (checkConnector(options.connector) ? CONNECTOR_LENGTH : 0) + (checkBackground(options.background) ? LABEL_BACKGROUND_PADDING_X : 0)
        };
    }
};

exports.Label = Label;

///#DEBUG
Label._DEBUG_formatText = formatText;
///#ENDDEBUG
