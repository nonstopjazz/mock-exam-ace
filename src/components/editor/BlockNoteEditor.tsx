import { useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/shadcn';
import '@blocknote/shadcn/style.css';
import { useCallback, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Toggle } from '@/components/ui/toggle';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Code,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Link as LinkIcon,
  Undo,
  Redo,
  Type,
  Highlighter,
} from 'lucide-react';

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

  // Toolbar action handlers
  const toggleBold = () => {
    editor.toggleStyles({ bold: true });
  };

  const toggleItalic = () => {
    editor.toggleStyles({ italic: true });
  };

  const toggleUnderline = () => {
    editor.toggleStyles({ underline: true });
  };

  const toggleStrike = () => {
    editor.toggleStyles({ strike: true });
  };

  const toggleCode = () => {
    editor.toggleStyles({ code: true });
  };

  const setBlockType = (type: string) => {
    const block = editor.getTextCursorPosition().block;
    if (type === 'paragraph') {
      editor.updateBlock(block, { type: 'paragraph' });
    } else if (type === 'heading1') {
      editor.updateBlock(block, { type: 'heading', props: { level: 1 } });
    } else if (type === 'heading2') {
      editor.updateBlock(block, { type: 'heading', props: { level: 2 } });
    } else if (type === 'heading3') {
      editor.updateBlock(block, { type: 'heading', props: { level: 3 } });
    } else if (type === 'bulletList') {
      editor.updateBlock(block, { type: 'bulletListItem' });
    } else if (type === 'numberedList') {
      editor.updateBlock(block, { type: 'numberedListItem' });
    }
  };

  const setAlignment = (alignment: 'left' | 'center' | 'right') => {
    const block = editor.getTextCursorPosition().block;
    editor.updateBlock(block, { props: { textAlignment: alignment } });
  };

  const insertLink = () => {
    const url = window.prompt('輸入連結網址：');
    if (url) {
      editor.createLink(url);
    }
  };

  const setTextColor = (color: string) => {
    editor.addStyles({ textColor: color });
  };

  const setBackgroundColor = (color: string) => {
    editor.addStyles({ backgroundColor: color });
  };

  return (
    <div className="border rounded-lg overflow-hidden bg-background blocknote-editor">
      {/* Fixed Toolbar at Top */}
      <div className="border-b bg-muted/30 p-2 flex flex-wrap items-center gap-1">
        {/* Undo/Redo */}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => editor.undo()}
        >
          <Undo className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => editor.redo()}
        >
          <Redo className="h-4 w-4" />
        </Button>

        <Separator orientation="vertical" className="mx-1 h-6" />

        {/* Block Type Select */}
        <Select onValueChange={setBlockType} defaultValue="paragraph">
          <SelectTrigger className="w-[130px] h-8">
            <SelectValue placeholder="段落格式" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="paragraph">內文</SelectItem>
            <SelectItem value="heading1">標題 1</SelectItem>
            <SelectItem value="heading2">標題 2</SelectItem>
            <SelectItem value="heading3">標題 3</SelectItem>
            <SelectItem value="bulletList">項目清單</SelectItem>
            <SelectItem value="numberedList">編號清單</SelectItem>
          </SelectContent>
        </Select>

        <Separator orientation="vertical" className="mx-1 h-6" />

        {/* Text Formatting */}
        <Toggle size="sm" onPressedChange={toggleBold} aria-label="Bold">
          <Bold className="h-4 w-4" />
        </Toggle>
        <Toggle size="sm" onPressedChange={toggleItalic} aria-label="Italic">
          <Italic className="h-4 w-4" />
        </Toggle>
        <Toggle size="sm" onPressedChange={toggleUnderline} aria-label="Underline">
          <Underline className="h-4 w-4" />
        </Toggle>
        <Toggle size="sm" onPressedChange={toggleStrike} aria-label="Strikethrough">
          <Strikethrough className="h-4 w-4" />
        </Toggle>
        <Toggle size="sm" onPressedChange={toggleCode} aria-label="Code">
          <Code className="h-4 w-4" />
        </Toggle>

        <Separator orientation="vertical" className="mx-1 h-6" />

        {/* Alignment */}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => setAlignment('left')}
        >
          <AlignLeft className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => setAlignment('center')}
        >
          <AlignCenter className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => setAlignment('right')}
        >
          <AlignRight className="h-4 w-4" />
        </Button>

        <Separator orientation="vertical" className="mx-1 h-6" />

        {/* Colors */}
        <div className="flex items-center gap-2">
          {/* Text Color */}
          <div className="flex items-center gap-1">
            <Type className="h-4 w-4 text-muted-foreground" />
            <input
              type="color"
              className="w-6 h-6 cursor-pointer border border-border rounded"
              onChange={(e) => setTextColor(e.target.value)}
              defaultValue="#000000"
              title="文字顏色"
            />
          </div>

          {/* Background Color */}
          <div className="flex items-center gap-1">
            <Highlighter className="h-4 w-4 text-muted-foreground" />
            <input
              type="color"
              className="w-6 h-6 cursor-pointer border border-border rounded"
              onChange={(e) => setBackgroundColor(e.target.value)}
              defaultValue="#ffff00"
              title="背景顏色"
            />
          </div>
        </div>

        <Separator orientation="vertical" className="mx-1 h-6" />

        {/* Link */}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={insertLink}
        >
          <LinkIcon className="h-4 w-4" />
        </Button>
      </div>

      {/* Editor Content */}
      <BlockNoteView
        editor={editor}
        onChange={handleChange}
        theme="light"
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
