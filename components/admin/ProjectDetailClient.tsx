'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import QuizEditor from '@/components/admin/QuizEditor';
import { GEMINI_MODEL_OPTIONS, type GeminiModel, type Project, type Quiz } from '@/types';
import { Link2, Copy, Check } from 'lucide-react';

const STATUS_LABEL: Record<Project['status'], string> = {
  draft: '초안', uploading: '업로드 중', processing: '처리 중',
  ready: '준비됨', active: '활성', inactive: '비활성',
};
const STATUS_VARIANT: Record<Project['status'], 'default' | 'secondary' | 'destructive' | 'outline'> = {
  draft: 'outline', uploading: 'secondary', processing: 'secondary',
  ready: 'default', active: 'default', inactive: 'destructive',
};

interface Props {
  project: Project;
  quizzes: Quiz[];
}

export default function ProjectDetailClient({ project: initial, quizzes: initialQuizzes }: Props) {
  const router = useRouter();
  const [project, setProject] = useState<Project>(initial);
  const [currentQuizzes, setCurrentQuizzes] = useState<Quiz[]>(initialQuizzes);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<GeminiModel>(
    initial.gemini_model ?? 'gemini-3.1-flash-lite-preview'
  );
  const [savingModel, setSavingModel] = useState(false);
  const [issuedLink, setIssuedLink] = useState<string | null>(null);
  const [issuingLink, setIssuingLink] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (file: File) => {
    if (!['text/plain', 'application/pdf'].includes(file.type)) {
      toast.error('TXT 또는 PDF 파일만 업로드 가능합니다.');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast.error('파일 크기는 20MB 이하여야 합니다.');
      return;
    }

    setUploading(true);
    setUploadProgress('업로드 중...');
    const formData = new FormData();
    formData.append('file', file);

    const res = await fetch(`/api/admin/projects/${project.id}/upload`, {
      method: 'POST',
      body: formData,
    });

    setUploading(false);
    setUploadProgress(null);

    if (!res.ok) {
      const err = await res.json();
      toast.error(err.error ?? '업로드에 실패했습니다.');
      return;
    }

    toast.success('파일이 업로드되었습니다.');
    setProject((p) => ({ ...p, status: 'ready' }));
    router.refresh();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  };

  const handleStatusChange = async (newStatus: 'active' | 'inactive') => {
    const res = await fetch(`/api/admin/projects/${project.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    if (!res.ok) {
      const err = await res.json();
      toast.error(err.error ?? '상태 변경에 실패했습니다.');
      return;
    }
    const { project: updated } = await res.json();
    setProject(updated);
    toast.success(newStatus === 'active' ? '프로젝트가 활성화되었습니다.' : '프로젝트가 비활성화되었습니다.');
  };

  const handleModelSave = async () => {
    setSavingModel(true);
    const res = await fetch(`/api/admin/projects/${project.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gemini_model: selectedModel }),
    });
    setSavingModel(false);
    if (!res.ok) {
      const err = await res.json();
      toast.error(err.error ?? '모델 변경에 실패했습니다.');
      setSelectedModel(project.gemini_model ?? 'gemini-3.1-flash-lite-preview');
      return;
    }
    const { project: updated } = await res.json();
    setProject(updated);
    toast.success('AI 모델이 변경되었습니다.');
  };

  const handleIssueLink = async () => {
    setIssuingLink(true);
    const userId = crypto.randomUUID();
    const res = await fetch('/api/admin/issue-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, projectId: project.id }),
    });
    setIssuingLink(false);
    if (!res.ok) {
      const err = await res.json();
      toast.error(err.error ?? '링크 발급에 실패했습니다.');
      return;
    }
    const { chatUrl } = await res.json();
    setIssuedLink(chatUrl);
  };

  const handleCopyLink = async () => {
    if (!issuedLink) return;
    await navigator.clipboard.writeText(issuedLink);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  const handleDelete = async () => {
    if (!confirm('프로젝트를 삭제하시겠습니까?')) return;
    const res = await fetch(`/api/admin/projects/${project.id}`, { method: 'DELETE' });
    if (!res.ok) {
      const err = await res.json();
      toast.error(err.error ?? '삭제에 실패했습니다.');
      return;
    }
    toast.success('프로젝트가 삭제되었습니다.');
    router.push('/admin');
  };

  const modelChanged = selectedModel !== (project.gemini_model ?? 'gemini-3.1-flash-lite-preview');

  return (
    <div className="max-w-2xl space-y-8">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">{project.project_name}</h1>
          <p className="text-muted-foreground text-sm">{project.brand_name}</p>
        </div>
        <Badge variant={STATUS_VARIANT[project.status]}>
          {STATUS_LABEL[project.status]}
        </Badge>
      </div>

      <Separator />

      {/* 기본 정보 */}
      <div className="space-y-4">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">기본 정보</h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div><span className="text-muted-foreground">쿠폰명:</span> {project.coupon_name}</div>
          <div className="truncate"><span className="text-muted-foreground">쿠폰 URL:</span> {project.coupon_url}</div>
          {project.persona_config?.keywords?.length > 0 && (
            <div className="col-span-2">
              <span className="text-muted-foreground">키워드: </span>
              {project.persona_config.keywords.map((kw: string) => (
                <Badge key={kw} variant="secondary" className="mr-1">{kw}</Badge>
              ))}
            </div>
          )}
        </div>
      </div>

      <Separator />

      {/* AI 모델 설정 */}
      <div className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">AI 모델 설정</h2>
        <div className="flex items-center gap-3">
          <Select value={selectedModel} onValueChange={(v) => setSelectedModel(v as GeminiModel)}>
            <SelectTrigger className="w-72">
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
          {modelChanged && (
            <Button size="sm" onClick={handleModelSave} disabled={savingModel}>
              {savingModel ? '저장 중...' : '저장'}
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          모델 변경 시 다음 대화부터 적용됩니다. 캐시는 자동 재생성됩니다.
        </p>
      </div>

      <Separator />

      {/* 채팅 링크 발급 — active 상태에서만 표시 */}
      {project.status === 'active' && (
        <>
          <div className="space-y-3">
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">채팅 링크 발급</h2>
            <p className="text-xs text-muted-foreground">
              사용자별 1회용 채팅 링크를 생성합니다. 발급된 링크는 24시간 유효합니다.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={handleIssueLink}
              disabled={issuingLink}
            >
              <Link2 className="h-4 w-4" />
              {issuingLink ? '발급 중...' : '새 링크 발급'}
            </Button>
            {issuedLink && (
              <div className="flex items-center gap-2 rounded-lg border bg-muted px-3 py-2">
                <code className="flex-1 text-xs break-all">{issuedLink}</code>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 flex-shrink-0"
                  onClick={handleCopyLink}
                >
                  {linkCopied ? (
                    <Check className="h-3.5 w-3.5 text-green-500" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
            )}
          </div>
          <Separator />
        </>
      )}

      {/* 파일 업로드 */}
      <div className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">브랜드 정보 파일</h2>
        {project.brand_info_path ? (
          <p className="text-sm text-muted-foreground">
            현재 파일: <code className="bg-muted px-1 rounded">{project.brand_info_path}</code>
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">아직 파일이 없습니다.</p>
        )}
        {project.status !== 'active' && (
          <div
            className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary transition-colors"
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? (
              <p className="text-sm text-muted-foreground">{uploadProgress}</p>
            ) : (
              <p className="text-sm text-muted-foreground">
                TXT 또는 PDF 파일을 드래그하거나 클릭하여 업로드 (최대 20MB)
              </p>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.pdf"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); }}
            />
          </div>
        )}
      </div>

      <Separator />

      {/* 퀴즈 편집 */}
      <QuizEditor
        projectId={project.id}
        initialQuizzes={currentQuizzes}
        projectStatus={project.status}
        brandInfoPath={project.brand_info_path}
        onQuizzesChange={setCurrentQuizzes}
      />

      <Separator />

      {/* 액션 */}
      <div className="flex flex-wrap gap-3">
        {project.status === 'ready' && (
          <Button
            onClick={() => handleStatusChange('active')}
            disabled={currentQuizzes.length < 3}
            title={currentQuizzes.length < 3 ? '퀴즈 3개가 필요합니다' : undefined}
          >
            활성화
          </Button>
        )}
        {project.status === 'active' && (
          <Button variant="outline" onClick={() => handleStatusChange('inactive')}>비활성화</Button>
        )}
        {['draft', 'inactive'].includes(project.status) && (
          <Button variant="destructive" onClick={handleDelete}>삭제</Button>
        )}
        <Button variant="ghost" onClick={() => router.push('/admin')}>목록으로</Button>
      </div>
    </div>
  );
}
