const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
        Header, Footer, AlignmentType, LevelFormat,
        HeadingLevel, BorderStyle, WidthType, ShadingType,
        PageNumber, PageBreak } = require('docx');
const fs = require('fs');

const border = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
const borders = { top: border, bottom: border, left: border, right: border };

function heading1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 360, after: 200 },
    children: [new TextRun({ text, bold: true, size: 32, font: { ascii: "Arial", hAnsi: "Arial", eastAsia: "Microsoft YaHei" } })]
  });
}

function heading2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 280, after: 160 },
    children: [new TextRun({ text, bold: true, size: 28, font: { ascii: "Arial", hAnsi: "Arial", eastAsia: "Microsoft YaHei" } })]
  });
}

function heading3(text) {
  return new Paragraph({
    spacing: { before: 200, after: 120 },
    children: [new TextRun({ text, bold: true, size: 24, font: { ascii: "Arial", hAnsi: "Arial", eastAsia: "Microsoft YaHei" } })]
  });
}

function para(text, opts = {}) {
  return new Paragraph({
    spacing: { after: 120 },
    ...opts,
    children: [new TextRun({ text, size: 22, font: { ascii: "Arial", hAnsi: "Arial", eastAsia: "Microsoft YaHei" } })]
  });
}

function boldPara(text) {
  return new Paragraph({
    spacing: { after: 120 },
    children: [new TextRun({ text, bold: true, size: 22, font: { ascii: "Arial", hAnsi: "Arial", eastAsia: "Microsoft YaHei" } })]
  });
}

function bullet(text, ref = "bullets") {
  return new Paragraph({
    numbering: { reference: ref, level: 0 },
    spacing: { after: 60 },
    children: [new TextRun({ text, size: 22, font: { ascii: "Arial", hAnsi: "Arial", eastAsia: "Microsoft YaHei" } })]
  });
}

function makeRow(cells, isHeader = false) {
  return new TableRow({
    cantSplit: true,
    children: cells.map((text, i) => new TableCell({
      borders,
      width: { size: cells._widths ? cells._widths[i] : 4680, type: WidthType.DXA },
      shading: isHeader ? { fill: "1F4E79", type: ShadingType.CLEAR } : undefined,
      margins: { top: 60, bottom: 60, left: 100, right: 100 },
      children: [new Paragraph({
        children: [new TextRun({
          text,
          bold: isHeader,
          size: 20,
          color: isHeader ? "FFFFFF" : "000000",
          font: { ascii: "Arial", hAnsi: "Arial", eastAsia: "Microsoft YaHei" }
        })]
      })]
    }))
  });
}

function makeTable(headers, rows, widths) {
  const totalWidth = widths.reduce((a, b) => a + b, 0);
  return new Table({
    width: { size: totalWidth, type: WidthType.DXA },
    columnWidths: widths,
    rows: [
      makeRow(headers, true),
      ...rows.map(r => makeRow(r))
    ]
  });
}

const doc = new Document({
  styles: {
    default: {
      document: {
        run: { font: { ascii: "Arial", hAnsi: "Arial", eastAsia: "Microsoft YaHei" }, size: 22 }
      }
    },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 32, bold: true, font: { ascii: "Arial", hAnsi: "Arial", eastAsia: "Microsoft YaHei" } },
        paragraph: { spacing: { before: 360, after: 200 }, outlineLevel: 0, keepNext: false, keepLines: false } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 28, bold: true, font: { ascii: "Arial", hAnsi: "Arial", eastAsia: "Microsoft YaHei" } },
        paragraph: { spacing: { before: 280, after: 160 }, outlineLevel: 1, keepNext: false, keepLines: false } },
    ]
  },
  numbering: {
    config: [
      { reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "\u2022", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      { reference: "bullets2", levels: [{ level: 0, format: LevelFormat.BULLET, text: "\u2022", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
    ]
  },
  sections: [{
    properties: {
      page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, right: 1200, bottom: 1440, left: 1200 } }
    },
    headers: {
      default: new Header({ children: [new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [new TextRun({ text: "Trae Agent Team v2.8.0 \u2014 \u9879\u76EE\u603B\u89C8\u4E0E\u8BC4\u5BA1\u63D0\u4EA4", size: 18, color: "888888", font: { ascii: "Arial", hAnsi: "Arial", eastAsia: "Microsoft YaHei" } })]
      })] })
    },
    footers: {
      default: new Footer({ children: [new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: "\u7B2C ", size: 18, color: "888888", font: { ascii: "Arial", hAnsi: "Arial", eastAsia: "Microsoft YaHei" } }), new TextRun({ children: [PageNumber.CURRENT], size: 18, color: "888888" }), new TextRun({ text: " \u9875", size: 18, color: "888888", font: { ascii: "Arial", hAnsi: "Arial", eastAsia: "Microsoft YaHei" } })]
      })] })
    },
    children: [
      // === COVER ===
      new Paragraph({ spacing: { before: 3000 } }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
        children: [new TextRun({ text: "Trae Agent Team", size: 56, bold: true, font: { ascii: "Arial", hAnsi: "Arial", eastAsia: "Microsoft YaHei" } })]
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 100 },
        children: [new TextRun({ text: "\u98DE\u4E66\u9A71\u52A8\u7684 Trae \u591A\u4EFB\u52A1\u591A\u667A\u80FD\u4F53\u7CFB\u7EDF", size: 32, color: "555555", font: { ascii: "Arial", hAnsi: "Arial", eastAsia: "Microsoft YaHei" } })]
      }),
      new Paragraph({ spacing: { before: 600 } }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 100 },
        children: [new TextRun({ text: "\u9879\u76EE\u603B\u89C8\u4E0E\u8BC4\u5BA1\u63D0\u4EA4\u6587\u6863", size: 36, bold: true, font: { ascii: "Arial", hAnsi: "Arial", eastAsia: "Microsoft YaHei" } })]
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 80 },
        children: [new TextRun({ text: "v2.8.0 | Approved | 2026-04-26", size: 24, color: "1F4E79", font: { ascii: "Arial", hAnsi: "Arial", eastAsia: "Microsoft YaHei" } })]
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 400, after: 80 },
        children: [new TextRun({ text: "\u7ECF\u8FC7 6 \u8F6E\u8BC4\u5BA1\uFF0C\u72B6\u6001\u4E3A\u2705 \u6B63\u5F0F\u901A\u8FC7\uFF0C\u5177\u5907 Phase 0 \u9884\u7814\u4E0E Kickoff \u6761\u4EF6", size: 22, color: "666666", font: { ascii: "Arial", hAnsi: "Arial", eastAsia: "Microsoft YaHei" } })]
      }),

      // === 1. PROJECT OVERVIEW ===
      new Paragraph({ children: [new PageBreak()] }),
      heading1("1. \u9879\u76EE\u6982\u8FF0"),

      para("Trae Agent Team \u662F\u4E00\u4E2A\u901A\u8FC7 CDP \u534F\u8BAE\u6CE8\u5165 Trae IDE\uFF0C\u5B9E\u73B0\u591A\u4EFB\u52A1\u591A\u667A\u80FD\u4F53\u5E76\u884C\u534F\u4F5C\u7684\u81EA\u52A8\u5316\u7CFB\u7EDF\u3002\u6838\u5FC3\u76EE\u6807\u662F\u901A\u8FC7\u98DE\u4E66\u7FA4\u804A\u9A71\u52A8\u4EFB\u52A1\u6D41\u8F6C\uFF0C\u81EA\u52A8\u586B\u5145 AI Prompt \u5230 Trae Chat\uFF0C\u5229\u7528 Trae \u7B97\u529B\u5B9E\u73B0\u4EE3\u7801\u751F\u6210\u3001\u6D4B\u8BD5\u3001\u63D0\u4EA4\u7684\u5168\u6D41\u7A0B\u81EA\u52A8\u5316\u3002"),

      heading2("1.1 \u6838\u5FC3\u94FE\u8DEF"),
      para("\u98DE\u4E66\u7FA4\u804A /task \u2192 lark-cli \u76D1\u542C \u2192 \u4EFB\u52A1 MD \u6587\u6863 + Git \u5206\u652F \u2192 ChatMutex \u5E76\u53D1\u63A7\u5236 \u2192 CDP \u81EA\u52A8\u586B\u5145 Chat \u2192 Ralph Loop \u4E0D\u95F4\u65AD\u6267\u884C \u2192 Git \u81EA\u52A8\u63D0\u4EA4 \u2192 \u98DE\u4E66\u72B6\u6001\u56DE\u62A5"),

      heading2("1.2 \u6280\u672F\u6808"),
      makeTable(
        ["\u6280\u672F", "\u7528\u9014"],
        [
          ["Node.js >= 18 + TypeScript", "\u8FD0\u884C\u65F6"],
          ["chrome-remote-interface", "CDP \u5BA2\u6237\u7AEF"],
          ["xstate v5", "\u72B6\u6001\u673A\uFF083 \u4E2A\u6838\u5FC3\u6A21\u5757\uFF09"],
          ["Vitest + Playwright + c8", "\u6D4B\u8BD5"],
          ["lark-cli (WebSocket)", "\u98DE\u4E66\u96C6\u6210"],
          ["ESLint + Husky + lint-staged", "\u5DE5\u7A0B\u5316"],
        ],
        [4500, 4500]
      ),

      // === 2. DELIVERABLES ===
      heading1("2. \u4EA4\u4ED8\u7269\u6E05\u5355"),

      heading2("2.1 \u6838\u5FC3\u6587\u6863"),
      makeTable(
        ["\u6587\u4EF6", "\u8BF4\u660E", "\u7248\u672C"],
        [
          ["trae-agent-team-prd.md", "PRD \u4E3B\u6587\u6863\uFF0818 \u7AE0 + 4 \u9644\u5F55\uFF09", "v2.8.0"],
          ["docs/DO_AND_TESTING_SPEC.md", "AI \u5F00\u53D1\u4E0E\u6D4B\u8BD5\u89C4\u8303 (DoD)", "v1.0.0"],
          ["docs/CDP_MOCK_STRATEGY.md", "CDP Mock \u7B56\u7565\uFF083 \u7EA7\u65B9\u6848\uFF09", "v1.0.0"],
          ["docs/CDP_PROTOCOL_LOCK.md", "CDP \u534F\u8BAE\u7248\u672C\u9501\u5B9A\u7B56\u7565", "v1.0.0"],
          ["docs/XSTATE_SCOPE.md", "xstate \u4F7F\u7528\u8303\u56F4\u754C\u5B9A", "v1.0.0"],
          ["codesurf-trae-ralph-fusion-report.md", "\u878D\u5408\u53EF\u884C\u6027\u7814\u7A76\u62A5\u544A", "v1.0.0"],
        ],
        [3500, 3500, 1200]
      ),

      heading2("2.2 \u6267\u884C\u5951\u7EA6\uFF08exec-units/\uFF09"),
      makeTable(
        ["YAML \u6587\u4EF6", "\u6A21\u5757", "\u89E6\u53D1\u6761\u4EF6"],
        [
          ["chat-mutex.yaml", "ChatMutex \u9501\u7BA1\u7406", "\u4EFB\u52A1\u5206\u914D\u5230\u5B9E\u4F8B"],
          ["ui-recognizer.yaml", "UI \u81EA\u52A8\u8BC6\u522B\u63A2\u6D4B", "CDP \u8FDE\u63A5\u5EFA\u7ACB"],
          ["chat-fill.yaml", "Chat \u81EA\u52A8\u586B\u5145\uFF08P0-P2 \u964D\u7EA7\uFF09", "\u9501\u83B7\u53D6\u6210\u529F"],
          ["git-auto-commit.yaml", "Git \u81EA\u52A8\u63D0\u4EA4", "\u6587\u4EF6\u53D8\u66F4/\u4EFB\u52A1\u5B8C\u6210"],
          ["lark-terminal.yaml", "lark-cli \u7EC8\u7AEF\u7BA1\u7406", "\u7CFB\u7EDF\u542F\u52A8/\u65AD\u8FDE"],
        ],
        [3000, 3000, 3200]
      ),

      heading2("2.3 \u72B6\u6001\u673A\u5B9E\u73B0"),
      makeTable(
        ["\u6587\u4EF6", "\u72B6\u6001\u673A", "\u72B6\u6001\u6D41\u8F6C"],
        [
          ["src/core/states/task-machine.ts", "taskMachine", "pending\u2192assigned\u2192running\u2192completed/failed/blocked"],
          ["src/cdp/chat-mutex-machine.ts", "chatMutexMachine", "idle\u2192locked\u2192idle/timeout"],
        ],
        [3500, 2500, 3200]
      ),

      heading2("2.4 Trae IDE \u667A\u80FD\u4F53\u914D\u7F6E\uFF08.trae/agents/\uFF09"),
      makeTable(
        ["\u667A\u80FD\u4F53", "ID", "\u804C\u8D23"],
        [
          ["\uD83C\uDFD7\uFE0F \u7CFB\u7EDF\u67B6\u6784\u5E08", "@architect", "\u72B6\u6001\u673A\u8BBE\u8BA1\u3001\u6267\u884C\u5361\u7247\u751F\u6210"],
          ["\uD83D\uDCBB \u6838\u5FC3\u5F00\u53D1", "@core-dev", "CDP \u6A21\u5757\u3001\u5E76\u53D1\u63A7\u5236\u3001\u98DE\u4E66\u96C6\u6210"],
          ["\uD83E\uDDEA \u6D4B\u8BD5\u4E13\u5BB6", "@qa-expert", "Vitest/Playwright\u3001\u6DF7\u6C8C\u6D4B\u8BD5"],
          ["\uD83D\uDEE1\uFE0F \u5B89\u5168\u5BA1\u67E5\u5B98", "@security-reviewer", "DoD \u5408\u89C4\u3001AI \u4EE3\u7801\u6EAF\u6E90"],
          ["\uD83E\uDD16 AI \u534F\u4F5C\u5DE5\u7A0B\u5E08", "@ai-prompt-eng", "Prompt \u6A21\u677F\u3001\u5DE5\u4F5C\u6D41\u7F16\u6392"],
          ["\uD83D\uDD27 DevOps \u4E13\u5BB6", "@devops-eng", "CI/CD\u3001Husky\u3001\u6DF7\u6C8C\u6D4B\u8BD5\u8C03\u5EA6"],
          ["\uD83D\uDCCA \u9879\u76EE\u7BA1\u7406", "@pm-lead", "\u91CC\u7A0B\u7891\u3001\u770B\u677F\u3001\u5BA1\u6279\u6D41"],
        ],
        [2500, 2500, 4200]
      ),

      heading2("2.5 \u5DE5\u7A0B\u5316\u914D\u7F6E"),
      makeTable(
        ["\u6587\u4EF6", "\u7528\u9014"],
        [
          [".cursorrules", "AI \u534F\u4F5C\u6307\u4EE4\u96C6\uFF08Cursor/Copilot\uFF09"],
          [".ai-prompts/executable-contract.md", "AI \u7F16\u7801\u6307\u4EE4\u6A21\u677F"],
          [".trae/rules.md", "\u5168\u5C40\u89C4\u5219\uFF08DoD + \u5B89\u5168\u7EA2\u7EBF\uFF09"],
          [".trae/agents.config.yaml", "\u667A\u80FD\u4F53\u8DEF\u7531\u4E0E\u5FEB\u6377\u952E\u914D\u7F6E"],
          [".github/PULL_REQUEST_TEMPLATE.md", "PR \u6A21\u677F\uFF08DoD \u68C0\u67E5\u6E05\u5355\uFF09"],
          [".github/workflows/ci.yml", "CI \u8D28\u91CF\u95E8\u7981\u914D\u7F6E"],
        ],
        [4500, 4700]
      ),

      heading2("2.6 VS Code \u63D2\u4EF6\u4EE3\u7801"),
      makeTable(
        ["\u6587\u4EF6", "\u8BF4\u660E"],
        [
          ["trae-agent-team/package.json", "\u63D2\u4EF6\u6E05\u5355"],
          ["trae-agent-team/src/extension.js", "\u63D2\u4EF6\u5165\u53E3\uFF084-Tab Webview + \u4FA7\u8FB9\u680F\uFF09"],
          ["test-cdp-ui-probe.js", "CDP UI \u63A2\u6D4B\u6D4B\u8BD5\u811A\u672C"],
        ],
        [4500, 4700]
      ),

      // === 3. FILE DIRECTORY ===
      heading1("3. \u5B8C\u6574\u6587\u4EF6\u76EE\u5F55"),

      para("\u4EE5\u4E0B\u4E3A\u9879\u76EE\u5B8C\u6574\u7684\u6587\u4EF6\u76EE\u5F55\u7ED3\u6784\uFF0C\u6807\u8BB0\u2713 \u7684\u4E3A\u6838\u5FC3\u8BC4\u5BA1\u6587\u4EF6\uFF1A"),

      new Paragraph({
        spacing: { before: 120, after: 60 },
        children: [new TextRun({ text: "\u6839\u76EE\u5F55/", bold: true, size: 22, font: { ascii: "Arial", hAnsi: "Arial", eastAsia: "Microsoft YaHei" } })]
      }),
      bullet("\u2713 trae-agent-team-prd.md          # PRD v2.8.0\uFF0818\u7AE0+4\u9644\u5F55\uFF09\u2605 \u6838\u5FC3"),
      bullet("\u2713 codesurf-trae-ralph-fusion-report.md  # \u878D\u5408\u53EF\u884C\u6027\u7814\u7A76"),
      bullet("\u2713 test-cdp-ui-probe.js              # CDP UI \u63A2\u6D4B\u6D4B\u8BD5\u811A\u672C"),
      bullet(".cursorrules                         # AI \u534F\u4F5C\u6307\u4EE4\u96C6"),

      new Paragraph({
        spacing: { before: 120, after: 60 },
        children: [new TextRun({ text: "docs/", bold: true, size: 22, font: { ascii: "Arial", hAnsi: "Arial", eastAsia: "Microsoft YaHei" } })]
      }),
      bullet("\u2713 DO_AND_TESTING_SPEC.md          # DoD \u89C4\u8303 v1.0.0\u2605 \u6838\u5FC3"),
      bullet("\u2713 CDP_MOCK_STRATEGY.md            # CDP Mock \u7B56\u7565\u2605 \u6838\u5FC3"),
      bullet("\u2713 CDP_PROTOCOL_LOCK.md            # CDP \u534F\u8BAE\u9501\u5B9A\u2605 \u6838\u5FC3"),
      bullet("\u2713 XSTATE_SCOPE.md                 # xstate \u8303\u56F4\u754C\u5B9A\u2605 \u6838\u5FC3"),

      new Paragraph({
        spacing: { before: 120, after: 60 },
        children: [new TextRun({ text: "exec-units/", bold: true, size: 22, font: { ascii: "Arial", hAnsi: "Arial", eastAsia: "Microsoft YaHei" } })]
      }),
      bullet("\u2713 chat-mutex.yaml                  # ChatMutex \u6267\u884C\u5361\u7247\u2605 \u6838\u5FC3"),
      bullet("\u2713 ui-recognizer.yaml               # UI \u8BC6\u522B\u6267\u884C\u5361\u7247\u2605 \u6838\u5FC3"),
      bullet("\u2713 chat-fill.yaml                   # Chat \u586B\u5145\u6267\u884C\u5361\u7247\u2605 \u6838\u5FC3"),
      bullet("\u2713 git-auto-commit.yaml             # Git \u63D0\u4EA4\u6267\u884C\u5361\u7247\u2605 \u6838\u5FC3"),
      bullet("\u2713 lark-terminal.yaml               # lark-cli \u6267\u884C\u5361\u7247\u2605 \u6838\u5FC3"),

      new Paragraph({
        spacing: { before: 120, after: 60 },
        children: [new TextRun({ text: ".trae/", bold: true, size: 22, font: { ascii: "Arial", hAnsi: "Arial", eastAsia: "Microsoft YaHei" } })]
      }),
      bullet("\u2713 rules.md                         # \u5168\u5C40\u89C4\u5219\u2605 \u6838\u5FC3"),
      bullet("\u2713 agents.config.yaml               # \u667A\u80FD\u4F53\u8DEF\u7531\u914D\u7F6E\u2605 \u6838\u5FC3"),
      bullet("\u2713 agents/architect.md               # \u67B6\u6784\u5E08\u63D0\u793A\u8BCD\u2605 \u6838\u5FC3"),
      bullet("\u2713 agents/core-dev.md                # \u6838\u5FC3\u5F00\u53D1\u63D0\u793A\u8BCD\u2605 \u6838\u5FC3"),
      bullet("\u2713 agents/qa-expert.md              # \u6D4B\u8BD5\u4E13\u5BB6\u63D0\u793A\u8BCD\u2605 \u6838\u5FC3"),
      bullet("\u2713 agents/security-reviewer.md       # \u5B89\u5168\u5BA1\u67E5\u5B98\u63D0\u793A\u8BCD\u2605 \u6838\u5FC3"),
      bullet("\u2713 agents/ai-prompt-eng.md           # AI \u534F\u4F5C\u5DE5\u7A0B\u5E08\u63D0\u793A\u8BCD\u2605 \u6838\u5FC3"),
      bullet("\u2713 agents/devops-eng.md             # DevOps \u63D0\u793A\u8BCD\u2605 \u6838\u5FC3"),
      bullet("\u2713 agents/pm-lead.md                # \u9879\u76EE\u7BA1\u7406\u63D0\u793A\u8BCD\u2605 \u6838\u5FC3"),

      new Paragraph({
        spacing: { before: 120, after: 60 },
        children: [new TextRun({ text: ".ai-prompts/", bold: true, size: 22, font: { ascii: "Arial", hAnsi: "Arial", eastAsia: "Microsoft YaHei" } })]
      }),
      bullet("\u2713 executable-contract.md           # AI \u7F16\u7801\u6307\u4EE4\u6A21\u677F\u2605 \u6838\u5FC3"),

      new Paragraph({
        spacing: { before: 120, after: 60 },
        children: [new TextRun({ text: ".github/", bold: true, size: 22, font: { ascii: "Arial", hAnsi: "Arial", eastAsia: "Microsoft YaHei" } })]
      }),
      bullet("\u2713 PULL_REQUEST_TEMPLATE.md        # PR \u6A21\u677F\uFF08DoD \u68C0\u67E5\u6E05\u5355\uFF09\u2605 \u6838\u5FC3"),
      bullet("\u2713 workflows/ci.yml                 # CI \u8D28\u91CF\u95E8\u7981\u2605 \u6838\u5FC3"),

      new Paragraph({
        spacing: { before: 120, after: 60 },
        children: [new TextRun({ text: "src/", bold: true, size: 22, font: { ascii: "Arial", hAnsi: "Arial", eastAsia: "Microsoft YaHei" } })]
      }),
      bullet("\u2713 core/states/task-machine.ts       # \u4EFB\u52A1\u751F\u547D\u5468\u671F xstate \u72B6\u6001\u673A\u2605 \u6838\u5FC3"),
      bullet("\u2713 cdp/chat-mutex-machine.ts       # ChatMutex xstate \u72B6\u6001\u673A\u2605 \u6838\u5FC3"),

      new Paragraph({
        spacing: { before: 120, after: 60 },
        children: [new TextRun({ text: "trae-agent-team/", bold: true, size: 22, font: { ascii: "Arial", hAnsi: "Arial", eastAsia: "Microsoft YaHei" } })]
      }),
      bullet("package.json                       # VS Code \u63D2\u4EF6\u6E05\u5355"),
      bullet("src/extension.js                   # \u63D2\u4EF6\u5165\u53E3\uFF084-Tab Webview\uFF09"),

      // === 4. REVIEW HISTORY ===
      heading1("4. \u8BC4\u5BA1\u5386\u53F2"),

      makeTable(
        ["\u7248\u672C", "\u65E5\u671F", "\u8BC4\u5BA1\u7ED3\u8BBA", "\u4E3B\u8981\u53D8\u66F4"],
        [
          ["v2.3.0", "04-25", "\uD83D\uDFE1 \u6709\u6761\u4EF6\u901A\u8FC7", "\u65B0\u589E VS Code \u63D2\u4EF6\u8BBE\u8BA1"],
          ["v2.4.0", "04-25", "\uD83D\uDFE1 \u6709\u6761\u4EF6\u901A\u8FC7", "\u65B0\u589E\u5F02\u5E38\u5904\u7406/\u5B89\u5168/\u53EF\u89C2\u6D4B\u6027 + Phase 0"],
          ["v2.5.0", "04-26", "\uD83D\uDFE1 \u6709\u6761\u4EF6\u901A\u8FC7", "\u65B0\u589E DoD & AI \u6D4B\u8BD5\u89C4\u8303"],
          ["v2.6.0", "04-26", "\uD83D\uDFE2 \u63A8\u8350\u901A\u8FC7", "Ralph \u89C4\u5219/\u573A\u666F\u68C0\u6D4B/CDP Mock/\u5DE5\u7A0B\u5316"],
          ["v2.7.0", "04-26", "\uD83D\uDFE2 \u6B63\u5F0F\u901A\u8FC7", "\u6267\u884C\u5951\u7EA6\u4F53\u7CFB/\u89D2\u8272\u77E9\u9635/\u667A\u80FD\u4F53"],
          ["v2.8.0", "04-26", "\u2705 Approved", "CDP\u534F\u8BAE\u9501\u5B9A/xstate\u8303\u56F4/Prompt\u7248\u672C/\u6DF7\u6C8C\u9891\u6B21/\u89C4\u5219\u751F\u547D\u5468\u671F"],
        ],
        [1200, 1200, 2200, 4600]
      ),

      // === 5. PRD CHAPTER INDEX ===
      heading1("5. PRD \u7AE0\u8282\u7D22\u5F15"),

      makeTable(
        ["\u7AE0\u8282", "\u5185\u5BB9"],
        [
          ["\u7B2C 1 \u7AE0", "\u9879\u76EE\u80CC\u666F\u4E0E\u613F\u666F"],
          ["\u7B2C 2 \u7AE0", "\u7CFB\u7EDF\u67B6\u6784"],
          ["\u7B2C 3 \u7AE0", "\u6838\u5FC3\u6A21\u5757\u8BBE\u8BA1\uFF083.1-3.8\uFF09"],
          ["\u7B2C 4 \u7AE0", "\u98DE\u4E66\u591A\u7EF4\u8868\u683C\u770B\u677F\u4E0E\u5BA1\u6279\u7CFB\u7EDF"],
          ["\u7B2C 5 \u7AE0", "\u98DE\u4E66\u7FA4\u804A\u6307\u4EE4\u8BBE\u8BA1"],
          ["\u7B2C 6 \u7AE0", "\u914D\u7F6E\u6587\u4EF6\u8BBE\u8BA1"],
          ["\u7B2C 7 \u7AE0", "VS Code \u63D2\u4EF6\u8BBE\u8BA1"],
          ["\u7B2C 8 \u7AE0", "\u9879\u76EE\u7ED3\u6784"],
          ["\u7B2C 9 \u7AE0", "CLI \u547D\u4EE4\u8BBE\u8BA1"],
          ["\u7B2C 10 \u7AE0", "\u5F02\u5E38\u5904\u7406\u4E0E\u81EA\u6108\u673A\u5236"],
          ["\u7B2C 11 \u7AE0", "\u53EF\u89C2\u6D4B\u6027\u8BBE\u8BA1"],
          ["\u7B2C 12 \u7AE0", "\u5B89\u5168\u8BBE\u8BA1\uFF08\u52A0\u5BC6\u5B58\u50A8/\u547D\u4EE4\u767D\u540D\u5355/CDP\u7AEF\u53E3\uFF09"],
          ["\u7B2C 13 \u7AE0", "\u6280\u672F\u5B9E\u73B0\u8BA1\u5212\uFF08Phase 0-3\uFF09"],
          ["\u7B2C 14 \u7AE0", "\u98CE\u9669\u4E0E\u7F13\u89E3"],
          ["\u7B2C 15 \u7AE0", "\u6210\u529F\u6307\u6807"],
          ["\u7B2C 16 \u7AE0", "\u5DE5\u7A0B\u4EA4\u4ED8\u6807\u51C6 (DoD)"],
          ["\u7B2C 17 \u7AE0", "\u6267\u884C\u5951\u7EA6\u4F53\u7CFB (YAML + xstate)"],
          ["\u7B2C 18 \u7AE0", "\u89D2\u8272\u77E9\u9635\u4E0E Trae IDE \u667A\u80FD\u4F53"],
          ["\u9644\u5F55 A", "lark-cli \u4E8B\u4EF6\u76D1\u542C\u53C2\u8003"],
          ["\u9644\u5F55 B", "CDP Chat \u586B\u5145\u964D\u7EA7\u7B56\u7565"],
          ["\u9644\u5F55 C", "\u53C2\u8003\u8D44\u6599"],
          ["\u9644\u5F55 D", "\u8BC4\u5BA1\u5386\u53F2"],
        ],
        [2000, 7200]
      ),

      // === 6. NEXT STEPS ===
      heading1("6. \u540E\u7EED\u6B65\u9AA4"),

      heading2("Phase 0 \u524D\u7F6E\u6E05\u5355\uFF08Kickoff \u524D\u5FC5\u505A\uFF09"),
      bullet("\u521D\u59CB\u5316 exec-units/ \u4E0E __tests__/ \u76EE\u5F55\u7ED3\u6784"),
      bullet("\u914D\u7F6E CI \u95E8\u7981\u4E0E Prompt Lint"),
      bullet("\u9501\u5B9A Trae \u9884\u7814\u7248\u672C\u4E0E CDP \u534F\u8BAE\u5FEB\u7167"),
      bullet("\u5212\u5B9A xstate \u4F7F\u7528\u8FB9\u754C\u5E76\u8F93\u51FA\u57FA\u7EBF\u793A\u4F8B"),
      bullet("\u914D\u7F6E Husky + lint-staged + commitlint"),

      heading2("Phase 0 \u6280\u672F\u9884\u7814\uFF08W1-W2\uFF09"),
      bullet("Lexical \u7F16\u8F91\u5668\u586B\u5145\u65B9\u6848\u9A8C\u8BC1\uFF083 \u79CD\u7B56\u7565\u81F3\u5C11 2 \u79CD\u53EF\u7528\uFF09"),
      bullet("CDP \u591A\u5B9E\u4F8B\u8FDE\u63A5\u6D4B\u8BD5\uFF083 \u5B9E\u4F8B\u5E76\u884C 4h+\uFF09"),
      bullet("lark-cli \u957F\u8FDE\u63A5\u7A33\u5B9A\u6027\u6D4B\u8BD5\uFF0824h+\uFF09"),
      bullet("UI Recognizer DOM \u5206\u6790\uFF086 \u7C7B\u5143\u7D20\u81F3\u5C11 4 \u7C7B\u5339\u914D\uFF09"),
    ]
  }]
});

Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync("/workspace/trae-agent-team-overview.docx", buffer);
  console.log("DOCX created: /workspace/trae-agent-team-overview.docx");
});
