/**
 * export.js - 调查单 Word 导出
 * 使用 docx.js 生成符合《黑龙江省农村供水工程调查表》格式的 Word 文档
 */

var ExportManager = (function() {
    // 动态加载 docx.js
    var _docxLoaded = false;
    var _docxCbs = [];
    
    function loadDocxLib(cb) {
        if (_docxLoaded && typeof docx !== 'undefined') { cb(); return; }
        _docxCbs.push(cb);
        if (_docxCbs.length > 1) return;
        
        var script = document.createElement('script');
        script.src = 'js/lib/docx.min.js';
        script.onload = function() {
            _docxLoaded = true;
            _docxCbs.forEach(function(fn){ fn(); });
            _docxCbs = [];
        };
        script.onerror = function() {
            // 降级：导出为HTML格式
            _docxCbs.forEach(function(fn){ fn(); });
            _docxCbs = [];
        };
        document.head.appendChild(script);
    }

    // 导出调查表为 Word
    function exportSurveyWord(stationId, type) {
        var station = null;
        var list = type === 'central' ? Storage.getCentralStations() : Storage.getDispersedStations();
        list.forEach(function(s) { if (s.id === stationId) station = s; });
        
        var surveyData = Storage.getSurvey(stationId) || {};
        
        if (!station && !surveyData) {
            Utils.showToast('未找到站点数据');
            return;
        }
        
        Utils.showToast('正在生成Word文档...', 3000);
        
        loadDocxLib(function() {
            if (typeof docx !== 'undefined') {
                generateDocxFile(station, surveyData);
            } else {
                // 降级：生成HTML版本并下载
                generateHtmlReport(station, surveyData);
            }
        });
    }

    // 生成 docx 文件
    function generateDocxFile(station, survey) {
        try {
            var D = docx;
            
            var info = station || {};
            var s = survey || {};
            
            var title = new D.Paragraph({
                children: [new D.TextRun({
                    text: '黑龙江省农村供水工程调查表',
                    bold: true,
                    size: 44,
                    font: '方正小标宋简体'
                })],
                alignment: D.AlignmentType.CENTER,
                spacing: { before: 200, after: 200 }
            });
            
            // 地点行
            var locationPara = new D.Paragraph({
                children: [
                    new D.TextRun({ text: '地    点：', font: '宋体', size: 21 }),
                    new D.TextRun({ text: '        ', underline: {}, font: '宋体', size: 21 }),
                    new D.TextRun({ text: '县（市、区）', font: '宋体', size: 21 }),
                    new D.TextRun({ text: '        ', underline: {}, font: '宋体', size: 21 }),
                    new D.TextRun({ text: '乡（镇）', font: '宋体', size: 21 }),
                    new D.TextRun({ text: '        ', underline: {}, font: '宋体', size: 21 }),
                    new D.TextRun({ text: '村', font: '宋体', size: 21 }),
                    new D.TextRun({ text: '        ', underline: {}, font: '宋体', size: 21 }),
                    new D.TextRun({ text: '屯', font: '宋体', size: 21 }),
                    new D.TextRun({ text: '                    ', underline: {}, font: '宋体', size: 21 }),
                    new D.TextRun({ text: '供水工程', font: '宋体', size: 21 })
                ],
                spacing: { after: 100 }
            });
            
            // 时间行
            var datePara = new D.Paragraph({
                children: [
                    new D.TextRun({ text: '时    间：', font: '宋体', size: 21 }),
                    new D.TextRun({ text: '      ', underline: {}, font: '宋体', size: 21 }),
                    new D.TextRun({ text: '年', font: '宋体', size: 21 }),
                    new D.TextRun({ text: '    ', underline: {}, font: '宋体', size: 21 }),
                    new D.TextRun({ text: '月', font: '宋体', size: 21 }),
                    new D.TextRun({ text: '    ', underline: {}, font: '宋体', size: 21 }),
                    new D.TextRun({ text: '日', font: '宋体', size: 21 }),
                    new D.TextRun({ text: '；调查人员：', font: '宋体', size: 21 }),
                    new D.TextRun({ text: '                                        ', underline: {}, font: '宋体', size: 21 })
                ],
                spacing: { after: 200 }
            });

            // 辅助函数
            function checkBox(checked) {
                return new D.TextRun({ text: checked ? '☑' : '□', size: 20, font: '宋体' });
            }
            
            function normalText(text) {
                return new D.TextRun({ text: text || '', size: 20, font: '宋体' });
            }
            
            function makeCell(content, width, options) {
                options = options || {};
                return new D.TableCell({
                    children: Array.isArray(content) ? content : [content],
                    width: { size: width || 4000, type: D.WidthType.DXA },
                    margins: { top: 60, bottom: 60, left: 80, right: 80 },
                    verticalAlign: options.center ? D.VerticalAlign.CENTER : undefined,
                    rowSpan: options.rowSpan || 1
                });
            }
            
            function makePara(children) {
                return new D.Paragraph({
                    children: Array.isArray(children) ? children : [children],
                    spacing: { before: 40, after: 40 }
                });
            }

            // 构建调查表主体表格
            var tableRows = [];
            
            // ===== 水质行（7行合并）=====
            var waterQuality = s.waterQuality || '';
            var probs = s.waterQualityProb || [];
            
            var wqRow1 = new D.TableRow({
                children: [
                    makeCell(new D.Paragraph({
                        children: [new D.TextRun({ text: '水质', bold: true, size: 21, font: '宋体' })],
                        alignment: D.AlignmentType.CENTER
                    }), 1200, { rowSpan: 7, center: true }),
                    makeCell(makePara([
                        checkBox(waterQuality === '符合要求'),
                        normalText('符合要求。饮用水中无肉眼可见杂质、无异色异味、用水户长期饮用无不良反应。')
                    ]), 8740)
                ]
            });
            tableRows.push(wqRow1);
            
            var wqRow2 = new D.TableRow({
                children: [makeCell(makePara([
                    checkBox(waterQuality === '不符合要求'),
                    normalText('不符合要求。')
                ]), 8740)]
            });
            tableRows.push(wqRow2);
            
            var wqOptions = ['杂质','浑浊','异色','异味','长期饮用有不良反应'];
            wqOptions.forEach(function(opt, idx) {
                var checked = probs.some(function(p) { return p.indexOf(opt) >= 0; });
                tableRows.push(new D.TableRow({
                    children: [makeCell(makePara([
                        checkBox(checked),
                        normalText(opt)
                    ]), 8740)]
                }));
            });
            
            // ===== 水量行 =====
            var wq3 = s.waterQuantity || '';
            tableRows.push(new D.TableRow({
                children: [
                    makeCell(new D.Paragraph({
                        children: [new D.TextRun({ text: '水量', bold: true, size: 21, font: '宋体' })],
                        alignment: D.AlignmentType.CENTER
                    }), 1200, { center: true }),
                    makeCell([
                        makePara([
                            checkBox(wq3 === '符合要求'),
                            normalText('符合要求。水龙头入户正常出水且24小时连续供水；或在水龙头入户，采取定时供水以及水龙头尚未入户，但用水户日常取用的水井、水缸等储水设施有水并满足日常生活饮用水量。')
                        ]),
                        makePara([
                            checkBox(wq3 === '不符合要求'),
                            normalText('不符合要求。表现为：' + (s.waterQuantityDesc || ''))
                        ])
                    ], 8740)
                ]
            }));
            
            // ===== 用水方便程度行 =====
            var conv = s.convenience || '';
            tableRows.push(new D.TableRow({
                children: [
                    makeCell(new D.Paragraph({
                        children: [new D.TextRun({ text: '用水方\n便程度', bold: true, size: 21, font: '宋体' })],
                        alignment: D.AlignmentType.CENTER
                    }), 1200, { center: true }),
                    makeCell([
                        makePara([
                            checkBox(conv.indexOf('达标') === 0 && conv.indexOf('基本') < 0),
                            normalText('达标。集中式供水工程或分散式供水工程供水入户的用水户（含小区、院子）；因用水户个人意愿、风俗习惯，具备入户条件但未入户的；人力取水往返时间不超过10min或取水水平距离不超过400m、垂直距离不超过40m。')
                        ]),
                        makePara([
                            checkBox(conv.indexOf('基本达标') >= 0),
                            normalText('基本达标。人力取水往返时间不超过20min或取水水平距离不超过800m、垂直距离不超过80m。')
                        ]),
                        makePara([
                            checkBox(conv.indexOf('不达标') >= 0),
                            normalText('不达标。表现为：' + (s.convenienceDesc || ''))
                        ])
                    ], 8740)
                ]
            }));
            
            // ===== 供水保证率行 =====
            var sg = s.supplyGuarantee || '';
            tableRows.push(new D.TableRow({
                children: [
                    makeCell(new D.Paragraph({
                        children: [new D.TextRun({ text: '供水\n保证率', bold: true, size: 21, font: '宋体' })],
                        alignment: D.AlignmentType.CENTER
                    }), 1200, { center: true }),
                    makeCell([
                        makePara([
                            checkBox(sg.indexOf('达标') === 0 && sg.indexOf('基本') < 0),
                            normalText('达标。一年中水量不足的天数低于18天。')
                        ]),
                        makePara([
                            checkBox(sg.indexOf('基本达标') >= 0),
                            normalText('基本达标。一年中水量不足的天数低于36天。')
                        ]),
                        makePara([
                            checkBox(sg.indexOf('不达标') >= 0),
                            normalText('不达标。表现为：' + (s.supplyGuaranteeDesc || ''))
                        ])
                    ], 8740)
                ]
            }));
            
            // ===== 水费收缴及补贴机制行 =====
            var fc = s.feeCollected || '';
            tableRows.push(new D.TableRow({
                children: [
                    makeCell(new D.Paragraph({
                        children: [new D.TextRun({ text: '水费收缴\n及补贴机\n制', bold: true, size: 21, font: '宋体' })],
                        alignment: D.AlignmentType.CENTER
                    }), 1200, { center: true }),
                    makeCell([
                        makePara([
                            checkBox(fc === '收取水费'),
                            normalText('收取水费，水费标准：'),
                            new D.TextRun({ text: '        ', underline: {}, size: 20 }),
                            normalText('元/吨，'),
                            new D.TextRun({ text: '        ', underline: {}, size: 20 }),
                            normalText('元/户/年；'),
                            new D.TextRun({ text: '        ', underline: {}, size: 20 }),
                            normalText('元/人/年。')
                        ]),
                        makePara([
                            checkBox(fc === '未收取水费'),
                            normalText('未收取水费，运行维护费用由'),
                            new D.TextRun({ text: '                                        ', underline: {}, size: 20 }),
                            normalText('承担。')
                        ]),
                        makePara([
                            normalText('大牲畜养殖'),
                            checkBox(s.livestockFee === '缴费'),
                            normalText('缴费'),
                            new D.TextRun({ text: '        ', underline: {}, size: 20 }),
                            normalText('元/头/年    '),
                            checkBox(s.livestockFee === '不缴费'),
                            normalText('不缴费。')
                        ]),
                        makePara([
                            normalText('补贴机制，'),
                            checkBox(s.subsidyMechanism === '具有补贴机制'),
                            normalText('具有补贴机制    '),
                            checkBox(s.subsidyMechanism === '不具有补贴机制'),
                            normalText('不具有补贴机制。')
                        ])
                    ], 8740)
                ]
            }));
            
            // ===== 供水情况行 =====
            var sm = s.supplyMode || '';
            tableRows.push(new D.TableRow({
                children: [
                    makeCell(new D.Paragraph({
                        children: [new D.TextRun({ text: '供水情况', bold: true, size: 21, font: '宋体' })],
                        alignment: D.AlignmentType.CENTER
                    }), 1200, { center: true }),
                    makeCell(makePara([
                        checkBox(sm === '24小时连续供水'),
                        normalText('24小时供水；    '),
                        checkBox(sm === '定时供水'),
                        normalText('定时供水，'),
                        new D.TextRun({ text: '    ', underline: {}, size: 20 }),
                        normalText('次/日、'),
                        new D.TextRun({ text: '    ', underline: {}, size: 20 }),
                        normalText('小时/次')
                    ]), 8740)
                ]
            }));
            
            // ===== 供水工程行 =====
            var ps = s.projectStatus || '';
            var mgProbs = s.managementProb || [];
            tableRows.push(new D.TableRow({
                children: [
                    makeCell(new D.Paragraph({
                        children: [new D.TextRun({ text: '供水工程', bold: true, size: 21, font: '宋体' })],
                        alignment: D.AlignmentType.CENTER
                    }), 1200, { center: true }),
                    makeCell([
                        makePara([
                            normalText('稳定水源。'),
                            checkBox(s.stableSource === '是'),
                            normalText('是    '),
                            checkBox(s.stableSource === '否'),
                            normalText('否：'),
                            new D.TextRun({ text: '                    ', underline: {}, size: 20 }),
                            normalText('。')
                        ]),
                        makePara([
                            checkBox(ps === '运行管护良好'),
                            normalText('运行管护良好。水源周边无污染源，设置围栏、保护标识及明白卡，井室内部管理制度上墙、整洁无杂物。')
                        ]),
                        makePara([
                            checkBox(ps === '处于失管状态'),
                            normalText('处于失管状态。'),
                            new D.TextRun({ text: '                    ', underline: {}, size: 20 }),
                            checkBox(mgProbs.indexOf('无人期间未上锁') >= 0),
                            normalText('无人期间未上锁。')
                        ]),
                        makePara([
                            checkBox(mgProbs.indexOf('水源周边存在污染源') >= 0),
                            normalText('水源周边存在污染源，主要为：'),
                            new D.TextRun({ text: '                                        ', underline: {}, size: 20 })
                        ]),
                        makePara([
                            normalText('没有设置'),
                            checkBox(mgProbs.indexOf('未设置围栏') >= 0),
                            normalText('围栏    '),
                            checkBox(mgProbs.indexOf('未设置水源标识') >= 0),
                            normalText('水源标识    '),
                            checkBox(mgProbs.indexOf('未设置管理制度') >= 0),
                            normalText('管理制度')
                        ]),
                        makePara([
                            checkBox(mgProbs.indexOf('未设置明白卡') >= 0),
                            normalText('没有设置明白卡。')
                        ]),
                        makePara([
                            checkBox(mgProbs.indexOf('明白卡内容不全面') >= 0),
                            normalText('明白卡设置内容不全面，主要为：'),
                            new D.TextRun({ text: '                                        ', underline: {}, size: 20 })
                        ]),
                        makePara([
                            checkBox(mgProbs.indexOf('井室内部有杂物不整洁') >= 0),
                            normalText('井室内部有杂物，不整洁，脏乱差。    '),
                            normalText('水质检测报告：'),
                            checkBox(s.qualityReport === '有'),
                            normalText('有    '),
                            checkBox(s.qualityReport === '无'),
                            normalText('无。')
                        ]),
                        makePara([
                            normalText('水处理设备：'),
                            checkBox(s.treatmentEquip === '有'),
                            normalText('有    '),
                            checkBox(s.treatmentEquip === '无'),
                            normalText('无。    '),
                            normalText('消毒设备：'),
                            checkBox(s.disinfectEquip === '有'),
                            normalText('有    '),
                            checkBox(s.disinfectEquip === '无'),
                            normalText('无。')
                        ])
                    ], 8740)
                ]
            }));
            
            // ===== 维修服务行 =====
            tableRows.push(new D.TableRow({
                children: [
                    makeCell(new D.Paragraph({
                        children: [new D.TextRun({ text: '维修服务', bold: true, size: 21, font: '宋体' })],
                        alignment: D.AlignmentType.CENTER
                    }), 1200, { center: true }),
                    makeCell(makePara([
                        normalText('维修服务信息：'),
                        checkBox(s.repairInfo === '有'),
                        normalText('有    '),
                        checkBox(s.repairInfo === '无'),
                        normalText('无。    '),
                        normalText('维修服务时限：'),
                        checkBox(s.repairTimeliness === '及时'),
                        normalText('及时    '),
                        checkBox(s.repairTimeliness === '不及时'),
                        normalText('不及时。    '),
                        normalText('水管员健康证：'),
                        checkBox(s.managerHealthCert === '有'),
                        normalText('有    '),
                        checkBox(s.managerHealthCert === '无'),
                        normalText('无。')
                    ]), 8740)
                ]
            }));
            
            // ===== 管理情况行 =====
            tableRows.push(new D.TableRow({
                children: [
                    makeCell(new D.Paragraph({
                        children: [new D.TextRun({ text: '管理情况', bold: true, size: 21, font: '宋体' })],
                        alignment: D.AlignmentType.CENTER
                    }), 1200, { center: true }),
                    makeCell(makePara([
                        normalText('资金管理：'),
                        checkBox(s.fundManagement === '有'),
                        normalText('有    '),
                        checkBox(s.fundManagement === '无'),
                        normalText('无。    '),
                        normalText('县域统管管理：'),
                        checkBox(s.countyManagement === '有'),
                        normalText('有    '),
                        checkBox(s.countyManagement === '无'),
                        normalText('无。    '),
                        normalText('问题类型：'),
                        new D.TextRun({ text: '                                        ', underline: {}, size: 20 })
                    ]), 8740)
                ]
            }));
            
            // ===== 群众满意度及参与行（3行合并）=====
            var households = s.households || [];
            var hh1 = households[0] || {};
            var hh2 = households[1] || {};
            var hh3 = households[2] || {};
            
            var satisfyRow1 = new D.TableRow({
                children: [
                    makeCell(new D.Paragraph({
                        children: [new D.TextRun({ text: '群众满意\n度及参与', bold: true, size: 21, font: '宋体' })],
                        alignment: D.AlignmentType.CENTER
                    }), 1200, { rowSpan: 3, center: true }),
                    makeCell(makePara([
                        normalText('农户姓名'),
                        new D.TextRun({ text: '        ', underline: {}, size: 20 }),
                        normalText('；'),
                        checkBox(hh1.isPoor),
                        normalText('脱贫人口，'),
                        checkBox(hh1.satisfied === '满意'),
                        normalText('满意，'),
                        checkBox(hh1.satisfied === '不满意'),
                        normalText('不满意；意见建议：'),
                        new D.TextRun({ text: '                                        ', underline: {}, size: 20 })
                    ]), 8740)
                ]
            });
            tableRows.push(satisfyRow1);
            
            tableRows.push(new D.TableRow({
                children: [makeCell(makePara([
                    normalText('农户姓名'),
                    new D.TextRun({ text: '        ', underline: {}, size: 20 }),
                    normalText('；'),
                    checkBox(hh2.isPoor),
                    normalText('脱贫人口，'),
                    checkBox(hh2.satisfied === '满意'),
                    normalText('满意，'),
                    checkBox(hh2.satisfied === '不满意'),
                    normalText('不满意；意见建议：'),
                    new D.TextRun({ text: '                                        ', underline: {}, size: 20 })
                ]), 8740)]
            }));
            
            tableRows.push(new D.TableRow({
                children: [makeCell(makePara([
                    normalText('农户姓名'),
                    new D.TextRun({ text: '        ', underline: {}, size: 20 }),
                    normalText('；'),
                    checkBox(hh3.isPoor),
                    normalText('脱贫人口，'),
                    checkBox(hh3.satisfied === '满意'),
                    normalText('满意，'),
                    checkBox(hh3.satisfied === '不满意'),
                    normalText('不满意；意见建议：'),
                    new D.TextRun({ text: '                                        ', underline: {}, size: 20 })
                ]), 8740)]
            }));
            
            // ===== 建议及问题行 =====
            tableRows.push(new D.TableRow({
                children: [
                    makeCell(new D.Paragraph({
                        children: [new D.TextRun({ text: '建议\n及问题', bold: true, size: 21, font: '宋体' })],
                        alignment: D.AlignmentType.CENTER
                    }), 1200, { center: true }),
                    makeCell([
                        new D.Paragraph({ children: [normalText('')], spacing: { before: 200, after: 0 } }),
                        new D.Paragraph({ children: [normalText('')], spacing: { before: 200, after: 0 } }),
                        new D.Paragraph({ children: [normalText('')], spacing: { before: 200, after: 0 } }),
                        new D.Paragraph({
                            children: [
                                new D.TextRun({ text: '时    间：', font: '宋体', size: 21 }),
                                new D.TextRun({ text: '        ', underline: {}, font: '宋体', size: 21 }),
                                new D.TextRun({ text: '年', font: '宋体', size: 21 }),
                                new D.TextRun({ text: '    ', underline: {}, font: '宋体', size: 21 }),
                                new D.TextRun({ text: '月', font: '宋体', size: 21 }),
                                new D.TextRun({ text: '    ', underline: {}, font: '宋体', size: 21 }),
                                new D.TextRun({ text: '日', font: '宋体', size: 21 }),
                                new D.TextRun({ text: '                调查人员：', font: '宋体', size: 21 }),
                                new D.TextRun({ text: '                                        ', underline: {}, font: '宋体', size: 21 })
                            ],
                            spacing: { before: 400, after: 100 }
                        })
                    ], 8740)
                ]
            }));

            // 创建表格
            var mainTable = new D.Table({
                width: { size: 10000, type: D.WidthType.DXA },
                columnWidths: [1200, 8740],
                rows: tableRows,
                borders: {
                    top: { style: D.BorderStyle.SINGLE, size: 6, color: '000000' },
                    bottom: { style: D.BorderStyle.SINGLE, size: 6, color: '000000' },
                    left: { style: D.BorderStyle.SINGLE, size: 6, color: '000000' },
                    right: { style: D.BorderStyle.SINGLE, size: 6, color: '000000' },
                    insideH: { style: D.BorderStyle.SINGLE, size: 6, color: '000000' },
                    insideV: { style: D.BorderStyle.SINGLE, size: 6, color: '000000' }
                }
            });
            
            var doc = new D.Document({
                sections: [{
                    properties: {
                        page: {
                            size: { width: 11906, height: 16838 },
                            margin: { top: 850, right: 850, bottom: 850, left: 850 }
                        }
                    },
                    children: [title, locationPara, datePara, mainTable]
                }]
            });
            
            D.Packer.toBlob(doc).then(function(blob) {
                var filename = (s.county || '') + (s.town || '') + (station ? station.name : '') + '调查表.docx';
                downloadBlob(blob, filename);
                Utils.showToast('调查表已导出');
            }).catch(function(e) {
                console.error('docx生成失败:', e);
                generateHtmlReport(station, survey);
            });

        } catch(e) {
            console.error('生成Word失败，降级为HTML:', e);
            generateHtmlReport(station, survey);
        }
    }

    // 降级：生成HTML格式报告
    function generateHtmlReport(station, survey) {
        var s = survey || {};
        var info = station || {};
        
        var checkMark = function(label, checked, extra) {
            return '<tr><td style="padding:4px 8px;font-size:12px;">' + 
                   (checked ? '☑' : '□') + ' ' + label + (extra ? '  ' + extra : '') + '</td></tr>';
        };
        
        var html = '<!DOCTYPE html><html><head><meta charset="utf-8">' +
            '<title>农村供水工程调查表</title>' +
            '<style>body{font-family:"宋体",serif;font-size:13px;padding:20px;max-width:800px;margin:0 auto;}' +
            'h1{text-align:center;font-size:18px;font-family:"方正小标宋简体","黑体";}' +
            '.loc{margin:10px 0;font-size:13px;font-family:"楷体";}' +
            'table{border-collapse:collapse;width:100%;}' +
            'td,th{border:1px solid #000;padding:6px 8px;vertical-align:top;font-size:12px;}' +
            '.label{background:#f5f5f5;font-weight:bold;width:90px;text-align:center;}</style>' +
            '</head><body>' +
            '<h1>黑龙江省农村供水工程调查表</h1>' +
            '<p class="loc">地点：' + (s.county||info.county||'') + '县（市、区）&nbsp;&nbsp;' +
            (s.town||info.town||'') + '乡（镇）&nbsp;&nbsp;' +
            (s.village||info.village||'') + '村&nbsp;&nbsp;' +
            (s.hamlet||info.hamlet||'') + '屯&nbsp;&nbsp;' +
            (s.projectName||info.name||'') + ' 供水工程</p>' +
            '<table>';
        
        // 水质
        html += '<tr><td class="label" rowspan="7">水质</td><td>' +
            (s.waterQuality === '符合要求' ? '☑' : '□') + ' 符合要求。饮用水中无肉眼可见杂质、无异色异味、用水户长期饮用无不良反应。<br>' +
            (s.waterQuality === '不符合要求' ? '☑' : '□') + ' 不符合要求。</td></tr>';
        
        var probs = s.waterQualityProb || [];
        html += '<tr><td>' + ['有肉眼可见杂质','水质浑浊','水有异色','水有异味','长期饮用有不良反应'].map(function(p) {
            return (probs.indexOf(p) >= 0 ? '☑' : '□') + ' ' + p;
        }).join('&nbsp;&nbsp;') + '</td></tr>';
        
        // 水量
        html += '<tr><td class="label" rowspan="2">水量</td><td>' +
            (s.waterQuantity === '符合要求' ? '☑' : '□') + ' 符合要求。水龙头入户正常出水且24小时连续供水。<br>' +
            (s.waterQuantity === '不符合要求' ? '☑' : '□') + ' 不符合要求。表现为：' + (s.waterQuantityDesc || '') + '</td></tr>';
        
        // 用水方便程度
        var conv = s.convenience || '';
        html += '<tr><td class="label">用水方便程度</td><td>' +
            (conv.indexOf('达标') === 0 && conv.indexOf('基本') < 0 ? '☑' : '□') + ' 达标。供水入户或取水往返≤10分钟。<br>' +
            (conv.indexOf('基本达标') >= 0 ? '☑' : '□') + ' 基本达标。取水往返≤20分钟。<br>' +
            (conv.indexOf('不达标') >= 0 ? '☑' : '□') + ' 不达标。表现为：' + (s.convenienceDesc || '') + '</td></tr>';
        
        // 供水保证率
        var sg = s.supplyGuarantee || '';
        html += '<tr><td class="label">供水保证率</td><td>' +
            (sg.indexOf('达标') === 0 && sg.indexOf('基本') < 0 ? '☑' : '□') + ' 达标。一年中水量不足天数 < 18天。<br>' +
            (sg.indexOf('基本达标') >= 0 ? '☑' : '□') + ' 基本达标。一年中水量不足天数 < 36天。<br>' +
            (sg.indexOf('不达标') >= 0 ? '☑' : '□') + ' 不达标。' + (s.supplyGuaranteeDesc || '') + '</td></tr>';
        
        // 水费
        var fc = s.feeCollected || '';
        html += '<tr><td class="label">水费收缴及补贴机制</td><td>' +
            (fc === '收取水费' ? '☑' : '□') + ' 收取水费，水费标准：' + (s.feePerTon||'__') + '元/吨，' + (s.feePerHousehold||'__') + '元/户/年；' + (s.feePerPerson||'__') + '元/人/年。<br>' +
            (fc === '未收取水费' ? '☑' : '□') + ' 未收取水费，运行维护费用由' + (s.feeBearer||'') + '承担。<br>' +
            (s.subsidyMechanism === '具有补贴机制' ? '☑' : '□') + ' 具有补贴机制&nbsp;&nbsp;' +
            (s.subsidyMechanism === '不具有补贴机制' ? '☑' : '□') + ' 不具有补贴机制。</td></tr>';
        
        // 工程管理
        var ps = s.projectStatus || '';
        var mgProbs = s.managementProb || [];
        html += '<tr><td class="label">供水工程</td><td>' +
            '稳定水源：' + (s.stableSource === '是' ? '☑是' : '□是') + '&nbsp;' + (s.stableSource === '否' ? '☑否' : '□否') + '<br>' +
            (ps === '运行管护良好' ? '☑' : '□') + ' 运行管护良好。<br>' +
            (ps === '处于失管状态' ? '☑' : '□') + ' 处于失管状态。<br>' +
            mgProbs.map(function(p){ return '☑ ' + p; }).join('；') + '<br>' +
            '水质检测报告：' + (s.qualityReport === '有' ? '☑有' : '□有') + '&nbsp;' + (s.qualityReport === '无' ? '☑无' : '□无') + '<br>' +
            '水处理设备：' + (s.treatmentEquip === '有' ? '☑有' : '□有') + '&nbsp;' + (s.treatmentEquip === '无' ? '☑无' : '□无') + '<br>' +
            '消毒设备：' + (s.disinfectEquip === '有' ? '☑有' : '□有') + '&nbsp;' + (s.disinfectEquip === '无' ? '☑无' : '□无') +
            '</td></tr>';
        
        // 维修服务
        html += '<tr><td class="label">维修服务</td><td>' +
            '维修服务信息：' + (s.repairInfo === '有' ? '☑有' : '□有') + '&nbsp;' + (s.repairInfo === '无' ? '☑无' : '□无') + '<br>' +
            '维修服务时限：' + (s.repairTimeliness === '及时' ? '☑及时' : '□及时') + '&nbsp;' + (s.repairTimeliness === '不及时' ? '☑不及时' : '□不及时') + '<br>' +
            '水管员健康证：' + (s.managerHealthCert === '有' ? '☑有' : '□有') + '&nbsp;' + (s.managerHealthCert === '无' ? '☑无' : '□无') +
            '</td></tr>';
        
        // 管理情况
        html += '<tr><td class="label">管理情况</td><td>' +
            '资金管理：' + (s.fundManagement === '有' ? '☑有' : '□有') + '&nbsp;' + (s.fundManagement === '无' ? '☑无' : '□无') + '&nbsp;&nbsp;&nbsp;&nbsp;' +
            '县域统管：' + (s.countyManagement === '有' ? '☑有' : '□有') + '&nbsp;' + (s.countyManagement === '无' ? '☑无' : '□无') + '<br>' +
            '问题类型：' + (s.problemType || '') +
            '</td></tr>';
        
        // 群众满意度
        var households = s.households || [];
        var hHtml = households.filter(function(h){ return h && h.name; }).map(function(h) {
            return '农户姓名：' + h.name + '；' + (h.isPoor ? '脱贫人口；' : '') +
                   (h.satisfied === '满意' ? '☑满意 □不满意' : '□满意 ☑不满意') + '；意见建议：' + (h.suggestion || '');
        }).join('<br>') || '暂无';
        html += '<tr><td class="label">群众满意度及参与</td><td>' + hHtml + '</td></tr>';
        
        // 建议及问题
        html += '<tr><td class="label">建议及问题</td><td>' +
            (s.problemSummary || '') + '<br>' + (s.suggestions || '') +
            '<br><br>时    间：' + formatDocDate(s.finalDate || s.surveyDate || '') +
            '&nbsp;&nbsp;&nbsp;&nbsp;调查人员：' + (s.investigators || s.investigator || '') +
            '</td></tr>';
        
        html += '</table></body></html>';
        
        var filename = (s.county||'') + (s.town||'') + (station ? station.name : '未知') + '调查表.html';
        var blob = new Blob([html], { type: 'text/html;charset=utf-8' });
        downloadBlob(blob, filename);
        Utils.showToast('已生成调查表（HTML格式）', 3000);
    }

    // 下载 Blob
    function downloadBlob(blob, filename) {
        if (typeof plus !== 'undefined' && plus.io) {
            // 5+App 保存到本地
            var reader = new FileReader();
            reader.onload = function(e) {
                var base64 = e.target.result.split(',')[1];
                var path = '_doc/' + filename;
                plus.io.resolveLocalFileSystemURL(path, function(entry) {
                    entry.remove(function() {
                        saveToDoc(base64, path, filename);
                    }, function() {
                        saveToDoc(base64, path, filename);
                    });
                }, function() {
                    saveToDoc(base64, path, filename);
                });
            };
            reader.readAsDataURL(blob);
        } else {
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.click();
            setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
        }
    }

    function saveToDoc(base64, path, filename) {
        plus.io.resolveLocalFileSystemURL('_doc/', function(dir) {
            dir.getFile(filename, { create: true }, function(fileEntry) {
                fileEntry.createWriter(function(writer) {
                    writer.onwrite = function() {
                        Utils.showToast('文件已保存到：' + path, 3000);
                        // 打开文件
                        plus.runtime.openFile(fileEntry.toLocalURL());
                    };
                    writer.write(plus.android ? base64 : new Blob([atob(base64)]));
                });
            });
        });
    }

    function formatDocDate(dateStr) {
        if (!dateStr) return '____年__月__日';
        var d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        return d.getFullYear() + '年' + (d.getMonth()+1) + '月' + d.getDate() + '日';
    }

    // ===== 导出供水工程暗访记录表（Excel/CSV格式） =====
    function exportRecordTable() {
        var centralStations = Storage.getCentralStations();
        var dispersedStations = Storage.getDispersedStations();
        var surveys = Storage.getSurveys();
        
        // 只合并已调查的站点数据
        var surveyedStations = [];
        centralStations.forEach(function(s) {
            var survey = surveys[s.id];
            if (survey) {
                surveyedStations.push({
                    id: s.id,
                    type: '集中式',
                    name: s.name,
                    county: s.county,
                    town: s.town,
                    village: s.village,
                    hamlet: s.hamlet,
                    stationType: s.stationType || '-',
                    population: s.population,
                    survey: survey
                });
            }
        });
        dispersedStations.forEach(function(s) {
            var survey = surveys[s.id];
            if (survey) {
                surveyedStations.push({
                    id: s.id,
                    type: '分散式',
                    name: s.name,
                    county: s.county,
                    town: s.town,
                    village: s.village,
                    hamlet: s.hamlet,
                    stationType: '-',
                    population: s.population,
                    survey: survey
                });
            }
        });
        
        if (surveyedStations.length === 0) {
            Utils.showToast('暂无已调查的站点');
            return;
        }
        
        // 按地区排序
        surveyedStations.sort(function(a, b) {
            return (a.county + a.town + a.village).localeCompare(b.county + b.town + b.village);
        });
        
        Utils.showToast('正在生成暗访记录表...', 3000);
        
        // 生成CSV格式（Excel可直接打开）
        generateSurveyRecordCsv(surveyedStations);
    }
    
    // 生成Word格式的暗访记录表（24列）
    function generateSurveyRecordDocx(stations) {
        try {
            var D = docx;

            // 标题
            var title = new D.Paragraph({
                children: [new D.TextRun({
                    text: '2026年农村供水工程暗访记录表',
                    bold: true,
                    size: 36,
                    font: '方正小标宋简体'
                })],
                alignment: D.AlignmentType.CENTER,
                spacing: { before: 240, after: 200 }
            });

            // 辅助函数：创建表头单元格
            function createHeaderCell(text, width) {
                return new D.TableCell({
                    children: [new D.Paragraph({
                        children: [new D.TextRun({ text: text, bold: true, size: 16, font: '宋体' })],
                        alignment: D.AlignmentType.CENTER
                    })],
                    width: { size: width, type: D.WidthType.DXA },
                    shading: { fill: 'E7E6E6' },
                    margins: { top: 40, bottom: 40, left: 60, right: 60 }
                });
            }

            // 辅助函数：创建数据单元格
            function createDataCell(text, align) {
                return new D.TableCell({
                    children: [new D.Paragraph({
                        children: [new D.TextRun({ text: text || '', size: 14, font: '宋体' })],
                        alignment: align || D.AlignmentType.CENTER
                    })],
                    margins: { top: 40, bottom: 40, left: 60, right: 60 }
                });
            }

            // 表格行
            var tableRows = [];

            // 表头（24列）
            tableRows.push(new D.TableRow({
                children: [
                    createHeaderCell('序号', 300),
                    createHeaderCell('市', 400),
                    createHeaderCell('市合计', 400),
                    createHeaderCell('县（市）', 500),
                    createHeaderCell('县（市）合计', 500),
                    createHeaderCell('乡（镇）', 500),
                    createHeaderCell('乡（镇）合计', 500),
                    createHeaderCell('村屯', 500),
                    createHeaderCell('村屯合计', 400),
                    createHeaderCell('供水工程名称', 800),
                    createHeaderCell('供水工程数量', 500),
                    createHeaderCell('入户数量', 400),
                    createHeaderCell('查看工程数量', 500),
                    createHeaderCell('发现问题数量', 500),
                    createHeaderCell('暗访发现问题', 800),
                    createHeaderCell('整改情况', 600),
                    createHeaderCell('共组织暗访组数量', 600),
                    createHeaderCell('暗访时间', 600),
                    createHeaderCell('暗访人员', 600),
                    createHeaderCell('暗访人员数量合计', 600),
                    createHeaderCell('暗访工程建设年限', 600),
                    createHeaderCell('是否下发方反馈意见', 600),
                    createHeaderCell('下发反馈意见编号', 600),
                    createHeaderCell('是否完成整改', 600)
                ]
            }));

            // 数据行
            stations.forEach(function(item, index) {
                var s = item.survey || {};
                var station = item;
                
                // 统计问题数量
                var problemCount = 0;
                var problems = [];
                if (s.waterQuality === '不符合要求') { problemCount++; problems.push('水质不达标'); }
                if (s.waterQuantity === '不符合要求') { problemCount++; problems.push('水量不达标'); }
                if (s.convenience && s.convenience.indexOf('不达标') >= 0) { problemCount++; problems.push('方便程度不达标'); }
                if (s.supplyGuarantee && s.supplyGuarantee.indexOf('不达标') >= 0) { problemCount++; problems.push('保证率不达标'); }
                if (s.managementProb && s.managementProb.length > 0) { 
                    problemCount += s.managementProb.length; 
                    problems = problems.concat(s.managementProb);
                }
                
                // 计算暗访人员数量
                var investigatorCount = s.investigator ? s.investigator.split(/[,，、]/).length : 1;
                
                tableRows.push(new D.TableRow({
                    children: [
                        createDataCell(String(index + 1)),
                        createDataCell('绥化市'),
                        createDataCell(''),
                        createDataCell(station.county || ''),
                        createDataCell(''),
                        createDataCell(station.town || ''),
                        createDataCell(''),
                        createDataCell((station.village || '') + (station.hamlet || '')),
                        createDataCell(''),
                        createDataCell(station.name || ''),
                        createDataCell('1'),
                        createDataCell(s.households && s.households.length > 0 ? String(s.households.length) : '1'),
                        createDataCell('1'),
                        createDataCell(String(problemCount)),
                        createDataCell(problems.join('；') || '无'),
                        createDataCell(s.rectificationStatus || ''),
                        createDataCell('1'),
                        createDataCell(s.surveyDate || ''),
                        createDataCell(s.investigator || ''),
                        createDataCell(String(investigatorCount)),
                        createDataCell(s.projectYear || ''),
                        createDataCell(s.feedbackIssued || ''),
                        createDataCell(s.feedbackNo || ''),
                        createDataCell(s.rectificationCompleted || '')
                    ]
                }));
            });

            // 创建表格
            var table = new D.Table({
                width: { size: 20000, type: D.WidthType.DXA },
                rows: tableRows,
                borders: {
                    top: { style: D.BorderStyle.SINGLE, size: 4, color: '000000' },
                    bottom: { style: D.BorderStyle.SINGLE, size: 4, color: '000000' },
                    left: { style: D.BorderStyle.SINGLE, size: 4, color: '000000' },
                    right: { style: D.BorderStyle.SINGLE, size: 4, color: '000000' },
                    insideH: { style: D.BorderStyle.SINGLE, size: 4, color: '000000' },
                    insideV: { style: D.BorderStyle.SINGLE, size: 4, color: '000000' }
                }
            });

            var doc = new D.Document({
                sections: [{
                    properties: {
                        page: {
                            size: { width: 16838, height: 11906, orientation: D.PageOrientation.LANDSCAPE },
                            margin: { top: 500, right: 500, bottom: 500, left: 500 }
                        }
                    },
                    children: [title, table]
                }]
            });

            D.Packer.toBlob(doc).then(function(blob) {
                var filename = '2026年农村供水工程暗访记录表_' + formatDateForFilename() + '.docx';
                downloadBlob(blob, filename);
                Utils.showToast('暗访记录表已导出');
            }).catch(function(e) {
                console.error('暗访记录表生成失败:', e);
                generateSurveyRecordHtml(stations);
            });

        } catch(e) {
            console.error('生成暗访记录表失败:', e);
            generateSurveyRecordHtml(stations);
        }
    }

    // 生成HTML格式的暗访记录表（24列）
    function generateSurveyRecordHtml(stations) {
        var html = '<!DOCTYPE html><html><head><meta charset="utf-8">' +
            '<title>2026年农村供水工程暗访记录表</title>' +
            '<style>' +
            'body{font-family:"宋体",serif;font-size:12px;padding:10px;}' +
            'h1{text-align:center;font-size:18px;margin-bottom:15px;}' +
            'table{border-collapse:collapse;width:100%;table-layout:fixed;}' +
            'td,th{border:1px solid #000;padding:4px 6px;font-size:11px;text-align:center;word-wrap:break-word;}' +
            'th{background:#e7e6e6;font-weight:bold;}' +
            '.col-narrow{width:30px;}.col-small{width:50px;}.col-medium{width:80px;}.col-wide{width:120px;}' +
            '</style>' +
            '</head><body>' +
            '<h1>2026年农村供水工程暗访记录表</h1>' +
            '<table>' +
            '<tr>' +
            '<th class="col-narrow">序号</th>' +
            '<th class="col-small">市</th>' +
            '<th class="col-small">市合计</th>' +
            '<th class="col-medium">县（市）</th>' +
            '<th class="col-small">县（市）合计</th>' +
            '<th class="col-medium">乡（镇）</th>' +
            '<th class="col-small">乡（镇）合计</th>' +
            '<th class="col-medium">村屯</th>' +
            '<th class="col-small">村屯合计</th>' +
            '<th class="col-wide">供水工程名称</th>' +
            '<th class="col-small">供水工程数量</th>' +
            '<th class="col-small">入户数量</th>' +
            '<th class="col-small">查看工程数量</th>' +
            '<th class="col-small">发现问题数量</th>' +
            '<th class="col-wide">暗访发现问题</th>' +
            '<th class="col-medium">整改情况</th>' +
            '<th class="col-small">共组织暗访组数量</th>' +
            '<th class="col-medium">暗访时间</th>' +
            '<th class="col-medium">暗访人员</th>' +
            '<th class="col-small">暗访人员数量合计</th>' +
            '<th class="col-medium">暗访工程建设年限</th>' +
            '<th class="col-medium">是否下发方反馈意见</th>' +
            '<th class="col-medium">下发反馈意见编号</th>' +
            '<th class="col-medium">是否完成整改</th>' +
            '</tr>';

        stations.forEach(function(item, index) {
            var s = item.survey || {};
            var station = item;
            
            // 统计问题数量
            var problemCount = 0;
            var problems = [];
            if (s.waterQuality === '不符合要求') { problemCount++; problems.push('水质不达标'); }
            if (s.waterQuantity === '不符合要求') { problemCount++; problems.push('水量不达标'); }
            if (s.convenience && s.convenience.indexOf('不达标') >= 0) { problemCount++; problems.push('方便程度不达标'); }
            if (s.supplyGuarantee && s.supplyGuarantee.indexOf('不达标') >= 0) { problemCount++; problems.push('保证率不达标'); }
            if (s.managementProb && s.managementProb.length > 0) { 
                problemCount += s.managementProb.length; 
                problems = problems.concat(s.managementProb);
            }
            
            // 计算暗访人员数量
            var investigatorCount = s.investigator ? s.investigator.split(/[,，、]/).length : 1;
            
            html += '<tr>' +
                '<td>' + (index + 1) + '</td>' +
                '<td>绥化市</td>' +
                '<td></td>' +
                '<td>' + (station.county || '') + '</td>' +
                '<td></td>' +
                '<td>' + (station.town || '') + '</td>' +
                '<td></td>' +
                '<td>' + (station.village || '') + (station.hamlet || '') + '</td>' +
                '<td></td>' +
                '<td>' + (station.name || '') + '</td>' +
                '<td>1</td>' +
                '<td>' + (s.households && s.households.length > 0 ? s.households.length : '1') + '</td>' +
                '<td>1</td>' +
                '<td>' + problemCount + '</td>' +
                '<td>' + (problems.join('；') || '无') + '</td>' +
                '<td>' + (s.rectificationStatus || '') + '</td>' +
                '<td>1</td>' +
                '<td>' + (s.surveyDate || '') + '</td>' +
                '<td>' + (s.investigator || '') + '</td>' +
                '<td>' + investigatorCount + '</td>' +
                '<td>' + (s.projectYear || '') + '</td>' +
                '<td>' + (s.feedbackIssued || '') + '</td>' +
                '<td>' + (s.feedbackNo || '') + '</td>' +
                '<td>' + (s.rectificationCompleted || '') + '</td>' +
                '</tr>';
        });

        html += '</table></body></html>';

        var filename = '2026年农村供水工程暗访记录表_' + formatDateForFilename() + '.html';
        var blob = new Blob([html], { type: 'text/html;charset=utf-8' });
        downloadBlob(blob, filename);
        Utils.showToast('已生成暗访记录表（HTML格式）', 3000);
    }

    // 生成CSV格式的暗访记录表（24列，Excel可直接打开）
    function generateSurveyRecordCsv(stations) {
        try {
            // CSV表头（24列）
            var headers = [
                '序号', '市', '市合计', '县（市）', '县（市）合计', '乡（镇）', '乡（镇）合计',
                '村屯', '村屯合计', '供水工程名称', '供水工程数量', '入户数量', '查看工程数量',
                '发现问题数量', '暗访发现问题', '整改情况', '共组织暗访组数量', '暗访时间',
                '暗访人员', '暗访人员数量合计', '暗访工程建设年限', '是否下发方反馈意见',
                '下发反馈意见编号', '是否完成整改'
            ];

            // 转义CSV字段（处理逗号和换行）
            function escapeCsvField(field) {
                if (field === null || field === undefined) return '';
                var str = String(field);
                // 如果包含逗号、换行或双引号，需要用双引号包裹并转义内部双引号
                if (str.indexOf(',') >= 0 || str.indexOf('\n') >= 0 || str.indexOf('"') >= 0) {
                    str = '"' + str.replace(/"/g, '""') + '"';
                }
                return str;
            }

            // 构建CSV内容
            var csvRows = [];
            csvRows.push(headers.map(escapeCsvField).join(','));

            stations.forEach(function(item, index) {
                var s = item.survey || {};
                var station = item;

                // 统计问题数量
                var problemCount = 0;
                var problems = [];
                if (s.waterQuality === '不符合要求') { problemCount++; problems.push('水质不达标'); }
                if (s.waterQuantity === '不符合要求') { problemCount++; problems.push('水量不达标'); }
                if (s.convenience && s.convenience.indexOf('不达标') >= 0) { problemCount++; problems.push('方便程度不达标'); }
                if (s.supplyGuarantee && s.supplyGuarantee.indexOf('不达标') >= 0) { problemCount++; problems.push('保证率不达标'); }
                if (s.managementProb && s.managementProb.length > 0) {
                    problemCount += s.managementProb.length;
                    problems = problems.concat(s.managementProb);
                }

                // 计算暗访人员数量
                var investigatorCount = s.investigator ? s.investigator.split(/[,，、]/).length : 1;

                var row = [
                    String(index + 1),                    // 序号
                    '绥化市',                             // 市
                    '',                                   // 市合计
                    station.county || '',                 // 县（市）
                    '',                                   // 县（市）合计
                    station.town || '',                   // 乡（镇）
                    '',                                   // 乡（镇）合计
                    (station.village || '') + (station.hamlet || ''), // 村屯
                    '',                                   // 村屯合计
                    station.name || '',                   // 供水工程名称
                    '1',                                  // 供水工程数量
                    s.households && s.households.length > 0 ? String(s.households.length) : '1', // 入户数量
                    '1',                                  // 查看工程数量
                    String(problemCount),                 // 发现问题数量
                    problems.join('；') || '无',          // 暗访发现问题
                    s.rectificationStatus || '',          // 整改情况
                    '1',                                  // 共组织暗访组数量
                    s.surveyDate || '',                   // 暗访时间
                    s.investigator || '',                 // 暗访人员
                    String(investigatorCount),            // 暗访人员数量合计
                    s.projectYear || '',                  // 暗访工程建设年限
                    s.feedbackIssued || '',               // 是否下发方反馈意见
                    s.feedbackNo || '',                   // 下发反馈意见编号
                    s.rectificationCompleted || ''        // 是否完成整改
                ];

                csvRows.push(row.map(escapeCsvField).join(','));
            });

            // 添加BOM以支持中文
            var csvContent = '\uFEFF' + csvRows.join('\n');
            var blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            var filename = '2026年农村供水工程暗访记录表_' + formatDateForFilename() + '.csv';
            downloadBlob(blob, filename);
            Utils.showToast('暗访记录表已导出（Excel格式）');

        } catch(e) {
            console.error('生成CSV失败:', e);
            // 降级为HTML
            generateSurveyRecordHtml(stations);
        }
    }

    function formatDateForFilename() {
        var d = new Date();
        return d.getFullYear() + String(d.getMonth()+1).padStart(2,'0') + String(d.getDate()).padStart(2,'0');
    }

    return {
        exportSurveyWord: exportSurveyWord,
        exportRecordTable: exportRecordTable,
        generateHtmlReport: generateHtmlReport
    };
})();
