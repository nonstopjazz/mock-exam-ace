import { useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/shadcn';
import '@blocknote/shadcn/style.css';
import { useCallback, useEffect, useRef } from 'react';

interface BlockNoteEditorProps {
  content: string;
  onChange: (content: string) => void;
  onImageUpload?: (file: File) => Promise<string | null>;
  placeholder?: string;
}

export function BlockNoteEditor({
  content,
  onChange,
  onImageUpload,
  placeholder = '開始撰寫文章內容...',
}: BlockNoteEditorProps) {
  const isInternalUpdate = useRef(false);
  const hasInitialized = useRef(false);
  const lastExternalContent = useRef<string>('');

  const editor = useCreateBlockNote({
    initialContent: undefined,
    uploadFile: onImageUpload
      ? async (file: File) => {
          const url = await onImageUpload(file);
          return url || '';
        }
      : undefined,
  });

  // Initialize content from HTML on first load or when content changes externally
  useEffect(() => {
    if (!editor) return;

    // Skip if this was triggered by internal editing
    if (isInternalUpdate.current) {
      isInternalUpdate.current = false;
      return;
    }

    // Load content if: first time OR content changed externally
    const shouldLoadContent = !hasInitialized.current || content !== lastExternalContent.current;

    if (shouldLoadContent && content) {
      const loadContent = async () => {
        try {
          const blocks = await editor.tryParseHTMLToBlocks(content);
          editor.replaceBlocks(editor.document, blocks);
          lastExternalContent.current = content;
          hasInitialized.current = true;
        } catch (e) {
          console.error('Failed to parse HTML content:', e);
        }
      };
      loadContent();
    } else if (!content && !hasInitialized.current) {
      // Empty content on first load is OK
      hasInitialized.current = true;
    }
  }, [editor, content]);

  // Handle content changes
  const handleChange = useCallback(async () => {
    if (!editor) return;

    isInternalUpdate.current = true;
    try {
      const html = await editor.blocksToHTMLLossy(editor.document);
      lastExternalContent.current = html;
      onChange(html);
    } catch (e) {
      console.error('Failed to convert blocks to HTML:', e);
    }
  }, [editor, onChange]);

  if (!editor) {
    return (
      <div className="border rounded-lg p-4 min-h-[300px] bg-muted/20 animate-pulse">
        載入編輯器中...
      </div>
    );
  }

  return (
    <div className="border rounded-lg overflow-hidden bg-background blocknote-editor">
      <BlockNoteView
        editor={editor}
        onChange={handleChange}
        theme="light"
        data-theming-css-variables-demo
      />
      <style>{`
        .blocknote-editor .bn-editor {
          min-height: 300px;
          padding: 1rem;
        }
        .blocknote-editor .bn-side-menu {
          left: 0.5rem;
        }
        .blocknote-editor [data-node-type="heading"] {
          margin-top: 1.5rem;
          margin-bottom: 0.5rem;
        }
        .blocknote-editor [data-level="1"] {
          font-size: 1.875rem;
          font-weight: 700;
        }
        .blocknote-editor [data-level="2"] {
          font-size: 1.5rem;
          font-weight: 600;
        }
        .blocknote-editor [data-level="3"] {
          font-size: 1.25rem;
          font-weight: 600;
        }
      `}</style>
    </div>
  );
}

export default BlockNoteEditor;
