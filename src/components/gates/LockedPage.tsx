import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Lock, ArrowLeft, BookOpen } from "lucide-react";

interface LockedPageProps {
  title?: string;
  description?: string;
}

export function LockedPage({
  title = "功能即將推出",
  description = "此功能目前尚未開放，敬請期待！"
}: LockedPageProps) {
  const navigate = useNavigate();

  return (
    <Layout>
      <div className="container mx-auto px-4 py-20">
        <div className="mx-auto max-w-md">
          <Card className="text-center">
            <CardHeader>
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                <Lock className="h-8 w-8 text-muted-foreground" />
              </div>
              <CardTitle className="text-2xl">{title}</CardTitle>
              <CardDescription className="text-base">
                {description}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button
                className="w-full"
                onClick={() => navigate("/practice/vocabulary")}
              >
                <BookOpen className="mr-2 h-4 w-4" />
                前往單字練習
              </Button>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => navigate(-1)}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                返回上一頁
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
