'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { X } from 'lucide-react';
import { GEMINI_MODEL_OPTIONS, type GeminiModel } from '@/types';

const schema = z.object({
  project_name: z.string().min(1, '프로젝트명을 입력하세요'),
  brand_name: z.string().min(1, '브랜드명을 입력하세요'),
  coupon_name: z.string().min(1, '쿠폰 명칭을 입력하세요'),
  coupon_url: z.string().url('올바른 URL을 입력하세요'),
  keyword_input: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

export default function NewProjectForm() {
  const router = useRouter();
  const [keywords, setKeywords] = useState<string[]>([]);
  const [keywordInput, setKeywordInput] = useState('');
  const [geminiModel, setGeminiModel] = useState<GeminiModel>('gemini-3.1-flash-lite-preview');

  const { register, handleSubmit, formState: { errors, isSubmitting } } =
    useForm<FormData>({ resolver: zodResolver(schema) });

  const addKeyword = (value: string) => {
    const trimmed = value.trim();
    if (trimmed && !keywords.includes(trimmed)) {
      setKeywords((prev) => [...prev, trimmed]);
    }
    setKeywordInput('');
  };

  const removeKeyword = (kw: string) => setKeywords((prev) => prev.filter((k) => k !== kw));

  const onSubmit = async (data: FormData) => {
    const res = await fetch('/api/admin/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_name: data.project_name,
        brand_name: data.brand_name,
        persona_config: { keywords },
        coupon_name: data.coupon_name,
        coupon_url: data.coupon_url,
        gemini_model: geminiModel,
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      toast.error(err.error ?? '프로젝트 생성에 실패했습니다.');
      return;
    }

    const { project } = await res.json();
    toast.success('프로젝트가 생성되었습니다.');
    router.push(`/admin/projects/${project.id}`);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div className="space-y-1">
        <Label htmlFor="project_name">프로젝트명 *</Label>
        <Input id="project_name" {...register('project_name')} />
        {errors.project_name && <p className="text-sm text-destructive">{errors.project_name.message}</p>}
      </div>

      <div className="space-y-1">
        <Label htmlFor="brand_name">브랜드명 *</Label>
        <Input id="brand_name" {...register('brand_name')} />
        {errors.brand_name && <p className="text-sm text-destructive">{errors.brand_name.message}</p>}
      </div>

      <div className="space-y-1">
        <Label>페르소나 키워드</Label>
        <div className="flex gap-2">
          <Input
            value={keywordInput}
            onChange={(e) => setKeywordInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); addKeyword(keywordInput); }
              if (e.key === ',') { e.preventDefault(); addKeyword(keywordInput); }
            }}
            placeholder="키워드 입력 후 Enter"
          />
          <Button type="button" variant="outline" onClick={() => addKeyword(keywordInput)}>추가</Button>
        </div>
        {keywords.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {keywords.map((kw) => (
              <Badge key={kw} variant="secondary" className="gap-1">
                {kw}
                <button type="button" onClick={() => removeKeyword(kw)}>
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-1">
        <Label htmlFor="coupon_name">쿠폰 명칭 *</Label>
        <Input id="coupon_name" {...register('coupon_name')} placeholder="예: 10% 할인 쿠폰" />
        {errors.coupon_name && <p className="text-sm text-destructive">{errors.coupon_name.message}</p>}
      </div>

      <div className="space-y-1">
        <Label htmlFor="coupon_url">쿠폰 URL *</Label>
        <Input id="coupon_url" type="url" {...register('coupon_url')} placeholder="https://..." />
        {errors.coupon_url && <p className="text-sm text-destructive">{errors.coupon_url.message}</p>}
      </div>

      <div className="space-y-1">
        <Label>AI 모델</Label>
        <Select value={geminiModel} onValueChange={(v) => setGeminiModel(v as GeminiModel)}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {GEMINI_MODEL_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex gap-3 pt-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? '생성 중...' : '프로젝트 생성'}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          취소
        </Button>
      </div>
    </form>
  );
}
