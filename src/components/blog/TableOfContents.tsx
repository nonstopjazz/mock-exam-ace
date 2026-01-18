import { useState, useEffect, useMemo } from 'react';
import { ChevronDown, ChevronUp, List } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface TocItem {
  id: string;
  text: string;
  level: number;
}

interface TableOfContentsProps {
  content: string;
  className?: string;
}

// Generate slug from heading text
function generateSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s\u4e00-\u9fff-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

// Extract headings from HTML content
function extractHeadings(html: string): TocItem[] {
  const headings: TocItem[] = [];

  // Match H2, H3, and H4 tags
  const regex = /<h([234])[^>]*>([^<]+)<\/h[234]>/gi;
  let match;

  while ((match = regex.exec(html)) !== null) {
    const level = parseInt(match[1]);
    const text = match[2].trim();
    const id = generateSlug(text);

    if (text) {
      headings.push({ id, text, level });
    }
  }

  return headings;
}

// Extract headings from Markdown content
function extractHeadingsFromMarkdown(markdown: string): TocItem[] {
  const headings: TocItem[] = [];
  const lines = markdown.split('\n');

  for (const line of lines) {
    // Match ##, ###, and #### headings
    const match = line.match(/^(#{2,4})\s+(.+)$/);
    if (match) {
      const level = match[1].length;
      const text = match[2].trim();
      const id = generateSlug(text);

      if (text && level <= 4) {
        headings.push({ id, text, level });
      }
    }
  }

  return headings;
}

export function TableOfContents({ content, className }: TableOfContentsProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [activeId, setActiveId] = useState<string>('');

  // Extract headings from content (supports both HTML and Markdown)
  const headings = useMemo(() => {
    // Check if content is HTML or Markdown
    if (content.includes('<h2') || content.includes('<h3') || content.includes('<h4')) {
      return extractHeadings(content);
    }
    return extractHeadingsFromMarkdown(content);
  }, [content]);

  // Track active heading on scroll
  useEffect(() => {
    if (headings.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        });
      },
      {
        rootMargin: '-100px 0px -80% 0px',
        threshold: 0,
      }
    );

    // Observe all heading elements
    headings.forEach(({ id }) => {
      const element = document.getElementById(id);
      if (element) {
        observer.observe(element);
      }
    });

    return () => observer.disconnect();
  }, [headings]);

  // Don't render if no headings
  if (headings.length === 0) {
    return null;
  }

  const scrollToHeading = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      const yOffset = -100; // Offset for fixed header
      const y = element.getBoundingClientRect().top + window.pageYOffset + yOffset;
      window.scrollTo({ top: y, behavior: 'smooth' });
    }
  };

  return (
    <Card className={cn('mb-8', className)}>
      <CardHeader className="py-3 px-4">
        <Button
          variant="ghost"
          className="w-full justify-between p-0 h-auto font-semibold hover:bg-transparent"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <span className="flex items-center gap-2">
            <List className="h-4 w-4" />
            本文目錄
          </span>
          {isExpanded ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </Button>
      </CardHeader>

      {isExpanded && (
        <CardContent className="pt-0 pb-4 px-4">
          <nav aria-label="Table of contents">
            <ul className="space-y-1">
              {headings.map((heading, index) => (
                <li
                  key={`${heading.id}-${index}`}
                  className={cn(
                    heading.level === 3 && 'ml-4',
                    heading.level === 4 && 'ml-8'
                  )}
                >
                  <button
                    onClick={() => scrollToHeading(heading.id)}
                    className={cn(
                      'text-left w-full px-2 py-1.5 rounded-md text-sm transition-colors',
                      'hover:bg-muted hover:text-foreground',
                      activeId === heading.id
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'text-muted-foreground'
                    )}
                  >
                    {heading.text}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        </CardContent>
      )}
    </Card>
  );
}

export default TableOfContents;
