import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import {
  ChevronLeft,
  BookmarkPlus,
  CheckCircle,
  Volume2,
  Tag,
  BookOpen,
  Loader2,
  LogIn,
  Lock,
  ZoomIn,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";

interface PackItem {
  id: string;
  word: string;
  definition: string;
  part_of_speech: string | null;
  example_sentence: string | null;
  phonetic: string | null;
  sort_order: number;
}

interface PackImage {
  id: string;
  image_url: string;
  is_cover: boolean;
  sort_order: number;
}

interface Pack {
  id: string;
  title: string;
  description: string | null;
  theme: string | null;
  difficulty: string | null;
  is_public: boolean;
}

const VocabularyPackDetail = () => {
  const { packId } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  const [pack, setPack] = useState<Pack | null>(null);
  const [items, setItems] = useState<PackItem[]>([]);
  const [images, setImages] = useState<PackImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCollected, setIsCollected] = useState(false);
  const [selectedImage, setSelectedImage] = useState<PackImage | null>(null);

  useEffect(() => {
    if (packId) {
      fetchPackData();
    }
  }, [packId]);

  // Check if user has claimed this pack
  useEffect(() => {
    if (user && packId) {
      checkIfClaimed();
    }
  }, [user, packId]);

  async function fetchPackData() {
    setLoading(true);
    setError(null);

    // Fetch pack info
    const { data: packData, error: packError } = await supabase
      .from('packs')
      .select('id, title, description, theme, difficulty, is_public')
      .eq('id', packId)
      .single();

    if (packError) {
      setError('找不到此單字包');
      setLoading(false);
      return;
    }

    setPack(packData);

    // Fetch pack items
    const { data: itemsData, error: itemsError } = await supabase
      .from('pack_items')
      .select('id, word, definition, part_of_speech, example_sentence, phonetic, sort_order')
      .eq('pack_id', packId)
      .order('sort_order', { ascending: true });

    if (itemsError) {
      console.error('Failed to fetch pack items:', itemsError);
    } else {
      setItems(itemsData || []);
    }

    // Fetch pack images
    const { data: imagesData, error: imagesError } = await supabase
      .from('pack_images')
      .select('id, image_url, is_cover, sort_order')
      .eq('pack_id', packId)
      .order('sort_order', { ascending: true });

    if (imagesError) {
      console.error('Failed to fetch pack images:', imagesError);
    } else {
      setImages(imagesData || []);
    }

    setLoading(false);
  }

  async function checkIfClaimed() {
    const { data } = await supabase
      .from('user_pack_claims')
      .select('id')
      .eq('user_id', user!.id)
      .eq('pack_id', packId)
      .single();

    setIsCollected(!!data);
  }

  const handleCollect = () => {
    if (!user) {
      navigate(`/login?returnUrl=/practice/vocabulary/pack/${packId}`);
      return;
    }
    // For actual collection, user needs an invite token
    toast.info('請透過邀請碼領取此單字包');
  };

  // Loading state
  if (loading || authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">載入中...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !pack) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="p-8 text-center">
          <h2 className="text-2xl font-bold text-foreground mb-4">{error || '找不到此單字包'}</h2>
          <Button onClick={() => navigate("/practice/vocabulary")}>返回單字複習中心</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        {/* Back Button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/practice/vocabulary/collections")}
          className="mb-4"
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          返回詞彙收藏
        </Button>

        {/* Theme Images Carousel */}
        {images.length > 0 && (
          <div className="mb-6">
            <Carousel className="w-full">
              <CarouselContent>
                {images.map((image) => (
                  <CarouselItem key={image.id} className="md:basis-1/2 lg:basis-1/3">
                    <div
                      className="relative aspect-video rounded-lg overflow-hidden cursor-pointer group"
                      onClick={() => setSelectedImage(image)}
                    >
                      <img
                        src={image.image_url}
                        alt={pack.title}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                        <ZoomIn className="h-8 w-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                      {image.is_cover && (
                        <Badge className="absolute top-2 left-2 text-xs">封面</Badge>
                      )}
                    </div>
                  </CarouselItem>
                ))}
              </CarouselContent>
              {images.length > 1 && (
                <>
                  <CarouselPrevious className="left-2" />
                  <CarouselNext className="right-2" />
                </>
              )}
            </Carousel>
          </div>
        )}

        {/* Image Lightbox */}
        <Dialog open={!!selectedImage} onOpenChange={() => setSelectedImage(null)}>
          <DialogContent className="max-w-4xl p-0 overflow-hidden">
            <DialogTitle className="sr-only">圖片預覽</DialogTitle>
            {selectedImage && (
              <div className="relative">
                <img
                  src={selectedImage.image_url}
                  alt={pack.title}
                  className="w-full h-auto"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute top-2 right-2 bg-black/50 hover:bg-black/70 text-white"
                  onClick={() => setSelectedImage(null)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Pack Header */}
        <Card className="p-8 mb-6 bg-gradient-to-br from-primary/10 to-accent/10">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                {pack.is_public && (
                  <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50">
                    示意
                  </Badge>
                )}
                {pack.theme && (
                  <Badge variant="outline">
                    <Tag className="h-3 w-3 mr-1" />
                    {pack.theme}
                  </Badge>
                )}
                {pack.difficulty && (
                  <Badge variant="secondary">{pack.difficulty}</Badge>
                )}
              </div>

              <h1 className="text-4xl font-bold text-foreground mb-3">{pack.title}</h1>
              {pack.description && (
                <p className="text-lg text-muted-foreground mb-4">{pack.description}</p>
              )}
            </div>

            <div className="flex flex-col gap-3">
              {isCollected ? (
                <Button size="lg" variant="secondary" disabled>
                  <CheckCircle className="h-5 w-5 mr-2" />
                  已領取
                </Button>
              ) : user ? (
                <Button size="lg" onClick={handleCollect}>
                  <Lock className="h-5 w-5 mr-2" />
                  需邀請碼領取
                </Button>
              ) : (
                <Button size="lg" onClick={() => navigate(`/login?returnUrl=/practice/vocabulary/pack/${packId}`)}>
                  <LogIn className="h-5 w-5 mr-2" />
                  登入後領取
                </Button>
              )}

              <div className="text-center p-4 rounded-lg bg-background/50">
                <div className="text-3xl font-bold text-primary">{items.length}</div>
                <div className="text-sm text-muted-foreground">個單字</div>
              </div>
            </div>
          </div>

          {/* Progress for collected packs */}
          {isCollected && (
            <div className="mt-6 p-4 rounded-lg bg-background/70">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-foreground">學習進度</span>
                <span className="text-sm text-muted-foreground">0 / {items.length}</span>
              </div>
              <Progress value={0} className="h-2" />
            </div>
          )}
        </Card>

        {/* Word Cards */}
        <div className="mb-4">
          <h2 className="text-2xl font-bold text-foreground mb-4">
            單字列表 ({items.length} 個)
          </h2>
        </div>

        {items.length === 0 ? (
          <Card className="p-8 text-center">
            <BookOpen className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">此單字包尚無單字</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {items.map((item, index) => (
              <Card
                key={item.id}
                className="p-6 transition-all duration-300 hover:shadow-xl hover:-translate-y-1"
              >
                <div className="flex items-start justify-between mb-4">
                  <Badge variant="outline" className="text-xs">
                    #{index + 1}
                  </Badge>
                  {item.part_of_speech && (
                    <Badge variant="secondary" className="text-xs">
                      {item.part_of_speech}
                    </Badge>
                  )}
                </div>

                <div className="mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-2xl font-bold text-foreground">{item.word}</h3>
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0" disabled>
                      <Volume2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </div>
                  {item.phonetic && (
                    <p className="text-sm text-muted-foreground mb-2">{item.phonetic}</p>
                  )}
                  <p className="text-lg text-foreground font-medium">{item.definition}</p>
                </div>

                {item.example_sentence && (
                  <div className="p-4 rounded-lg bg-muted/50 border-l-4 border-primary">
                    <p className="text-sm text-foreground italic">{item.example_sentence}</p>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}

        {/* Bottom Actions for collected packs */}
        {isCollected && (
          <Card className="mt-8 p-6 bg-gradient-to-br from-green-500/10 to-primary/10 border-green-500/20">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-lg bg-green-500/20">
                  <CheckCircle className="h-6 w-6 text-green-600" />
                </div>
                <div>
                  <h4 className="font-semibold text-foreground">已加入你的收藏</h4>
                  <p className="text-sm text-muted-foreground">
                    這 {items.length} 個單字已加入複習池
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => navigate("/practice/vocabulary/collections")}>
                  查看收藏列表
                </Button>
                <Button onClick={() => navigate("/practice/vocabulary/srs")}>開始複習</Button>
              </div>
            </div>
          </Card>
        )}

        {/* Guest CTA */}
        {!user && (
          <Card className="mt-8 p-6 bg-gradient-to-br from-primary/10 to-accent/10 border-primary/20">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-lg bg-primary/20">
                  <BookmarkPlus className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h4 className="font-semibold text-foreground">想要收藏這個單字包？</h4>
                  <p className="text-sm text-muted-foreground">
                    登入後透過邀請碼即可領取，開始追蹤學習進度
                  </p>
                </div>
              </div>
              <Button onClick={() => navigate(`/login?returnUrl=/practice/vocabulary/pack/${packId}`)}>
                <LogIn className="h-4 w-4 mr-2" />
                登入 / 註冊
              </Button>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
};

export default VocabularyPackDetail;
