"use client";

import { useRef, useEffect, useImperativeHandle } from "react";
import dynamic from "next/dynamic";
import type { OnMount, OnChange } from "@monaco-editor/react";
import { getStepOrderAtLine, getHeaderLineForOrder, HEADER_REGEX } from "./editorUtils";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div className="flex-1 bg-[#1e1e1e] animate-pulse" aria-label="Loading editor" />
  ),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type IStandaloneCodeEditor = any;

export type MonacoEditorHandle = {
  scrollToStep: (order: number) => void;
};

type Props = {
  ref: React.Ref<MonacoEditorHandle>;
  initialContent: string;
  onChange: (value: string) => void;
  onCursorStepChange: (order: number) => void;
  language?: string;
};

export const MonacoEditorPane = ({ ref, initialContent, onChange, onCursorStepChange, language = "javascript" }: Props) => {
  const editorRef = useRef<IStandaloneCodeEditor>(null);
  const activeOrderRef = useRef<number | null>(null);

  useImperativeHandle(ref, () => ({
    scrollToStep(order: number) {
      const ed = editorRef.current;
      if (!ed) return;
      const lines: string[] = ed.getModel()?.getLinesContent() ?? [];
      const lineNumber = getHeaderLineForOrder(lines, order);
      if (lineNumber != null) {
        ed.revealLineInCenter(lineNumber);
        ed.setPosition({ lineNumber, column: 1 });
        ed.focus();
      }
    },
  }));

  const handleEditorDidMount: OnMount = (ed) => {
    editorRef.current = ed;

    ed.onDidChangeCursorPosition((e: { position: { lineNumber: number } }) => {
      const lines: string[] = ed.getModel()?.getLinesContent() ?? [];
      const order = getStepOrderAtLine(lines, e.position.lineNumber);
      if (order !== null && order !== activeOrderRef.current) {
        activeOrderRef.current = order;
        onCursorStepChange(order);
      }
    });
  };

  // Apply decorations to header lines
  useEffect(() => {
    const ed = editorRef.current;
    if (!ed) return;
    const model = ed.getModel();
    if (!model) return;

    const lines: string[] = model.getLinesContent();
    const decorations = lines
      .map((line: string, i: number) => (HEADER_REGEX.test(line) ? i + 1 : null))
      .filter((ln: number | null): ln is number => ln !== null)
      .map((lineNumber: number) => ({
        range: {
          startLineNumber: lineNumber,
          startColumn: 1,
          endLineNumber: lineNumber,
          endColumn: model.getLineMaxColumn(lineNumber),
        },
        options: {
          isWholeLine: true,
          className: "bulk-editor-header-line",
          inlineClassName: "bulk-editor-header-inline",
        },
      }));

    ed.createDecorationsCollection(decorations);
  });

  const handleChange: OnChange = (value) => onChange(value ?? "");

  return (
    <>
      <style>{`
        .bulk-editor-header-line {
          border-left: 2px solid rgba(165, 180, 252, 0.15);
        }
        .bulk-editor-header-inline {
          color: #818cf8 !important;
          font-weight: 500;
          letter-spacing: 0.01em;
          opacity: 0.8;
        }
      `}</style>
      <MonacoEditor
        defaultValue={initialContent}
        language={language}
        theme="vs-dark"
        options={{
          fontSize: 13,
          lineNumbers: "on",
          minimap: { enabled: false },
          wordWrap: "on",
          scrollBeyondLastLine: false,
          fontFamily: "GeistMono, 'Cascadia Code', 'Fira Code', monospace",
          padding: { top: 16, bottom: 16 },
          renderLineHighlight: "line",
          smoothScrolling: true,
          cursorBlinking: "smooth",
        }}
        onMount={handleEditorDidMount}
        onChange={handleChange}
      />
    </>
  );
};
