'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Pencil, Trash2, Check, X, Sparkles } from 'lucide-react';
import type { Quiz } from '@/types';

const MAX_QUIZZES = 5;
const ANSWER_MAX_LEN = 20;

interface Props {
  projectId: string;
  initialQuizzes: Quiz[];
  projectStatus: string;
  brandInfoPath: string | null;
  onQuizzesChange?: (quizzes: Quiz[]) => void;
}

export default function QuizEditor({
  projectId,
  initialQuizzes,
  projectStatus,
  brandInfoPath,
  onQuizzesChange,
}: Props) {
  const [quizzes, setQuizzes] = useState<Quiz[]>(initialQuizzes);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ step: 1, question: '', answer: '' });
  const [generating, setGenerating] = useState(false);
  const [addMode, setAddMode] = useState(false);
  const [newQuiz, setNewQuiz] = useState({ step: 1, question: '', answer: '' });

  const isActive = projectStatus === 'active';
  // BUG-10-04: 1개 이상이면 활성화 가능
  const canActivate = quizzes.length >= 1;

  const updateQuizzes = (updated: Quiz[]) => {
    setQuizzes(updated);
    onQuizzesChange?.(updated);
  };

  // 다음 추가 가능한 step: 기존 최대 step + 1 (최대 MAX_QUIZZES)
  const nextAvailableStep = Math.min(
    (quizzes.length > 0 ? Math.max(...quizzes.map((q) => q.step)) : 0) + 1,
    MAX_QUIZZES
  );

  // AI 자동 생성
  const handleGenerate = async () => {
    if (!brandInfoPath) { toast.error('먼저 브랜드 파일을 업로드해 주세요.'); return; }
    setGenerating(true);
    const res = await fetch(`/api/admin/projects/${projectId}/generate-quizzes`, { method: 'POST' });
    setGenerating(false);
    if (!res.ok) {
      const err = await res.json();
      toast.error(err.error ?? '퀴즈 생성에 실패했습니다.');
      return;
    }
    const { quizzes: generated } = await res.json();
    updateQuizzes(generated);
    toast.success('퀴즈 3개가 자동 생성되었습니다.');
  };

  // 편집 시작 (BUG-10-05: step도 편집 가능)
  const startEdit = (quiz: Quiz) => {
    setEditingId(quiz.id);
    setEditForm({ step: quiz.step, question: quiz.question, answer: quiz.answer });
  };

  // 편집 저장 (BUG-10-03: 20자, BUG-10-05: step 변경 포함)
  const saveEdit = async (quizId: string) => {
    if (editForm.answer.length > ANSWER_MAX_LEN) {
      toast.error(`정답은 ${ANSWER_MAX_LEN}자 이하여야 합니다.`); return;
    }
    const res = await fetch(`/api/admin/projects/${projectId}/quizzes/${quizId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editForm),
    });
    if (!res.ok) {
      const err = await res.json();
      toast.error(err.error ?? '저장에 실패했습니다.'); return;
    }
    // BUG-10-05: step 재배치가 일어났을 수 있으므로 목록 새로 가져오기
    const listRes = await fetch(`/api/admin/projects/${projectId}/quizzes`);
    if (listRes.ok) {
      const { quizzes: refreshed } = await listRes.json();
      updateQuizzes(refreshed);
    }
    setEditingId(null);
    toast.success('퀴즈가 저장되었습니다.');
  };

  // 삭제
  const deleteQuiz = async (quizId: string) => {
    if (!confirm('퀴즈를 삭제하시겠습니까?')) return;
    const res = await fetch(`/api/admin/projects/${projectId}/quizzes/${quizId}`, { method: 'DELETE' });
    if (!res.ok) { toast.error('삭제에 실패했습니다.'); return; }
    updateQuizzes(quizzes.filter((q) => q.id !== quizId));
    toast.success('퀴즈가 삭제되었습니다.');
  };

  // 수동 추가 (BUG-10-03: 20자, BUG-10-04: step 1~5)
  const handleAdd = async () => {
    if (!newQuiz.question || !newQuiz.answer) { toast.error('질문과 정답을 모두 입력하세요.'); return; }
    if (newQuiz.answer.length > ANSWER_MAX_LEN) {
      toast.error(`정답은 ${ANSWER_MAX_LEN}자 이하여야 합니다.`); return;
    }
    if (quizzes.length >= MAX_QUIZZES) {
      toast.error(`퀴즈는 최대 ${MAX_QUIZZES}개까지 추가할 수 있습니다.`); return;
    }
    const res = await fetch(`/api/admin/projects/${projectId}/quizzes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newQuiz),
    });
    if (!res.ok) { const err = await res.json(); toast.error(err.error ?? '추가 실패'); return; }
    const { quiz } = await res.json();
    updateQuizzes([...quizzes.filter((q) => q.step !== newQuiz.step), quiz].sort((a, b) => a.step - b.step));
    setAddMode(false);
    setNewQuiz({ step: nextAvailableStep, question: '', answer: '' });
    toast.success('퀴즈가 추가되었습니다.');
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* BUG-10-04: /5로 표시, 1개 이상 조건 */}
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            퀴즈 ({quizzes.length}/{MAX_QUIZZES})
          </h2>
          {!canActivate && (
            <span className="text-xs text-destructive">활성화하려면 퀴즈 1개 이상이 필요합니다</span>
          )}
        </div>
        {!isActive && quizzes.length < MAX_QUIZZES && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => {
              setNewQuiz({ step: nextAvailableStep, question: '', answer: '' });
              setAddMode(true);
            }}>+ 수동 추가</Button>
            <Button size="sm" onClick={handleGenerate} disabled={generating}>
              <Sparkles className="h-3.5 w-3.5 mr-1" />
              {generating ? 'AI 생성 중...' : 'AI 자동 생성'}
            </Button>
          </div>
        )}
      </div>

      {quizzes.length === 0 && !addMode ? (
        <p className="text-sm text-muted-foreground">
          퀴즈가 없습니다. AI 자동 생성 또는 수동으로 추가하세요.
        </p>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">단계</TableHead>
                <TableHead>질문</TableHead>
                <TableHead className="w-32">정답</TableHead>
                {!isActive && <TableHead className="w-20 text-right">관리</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {quizzes.map((quiz) => (
                <TableRow key={quiz.id}>
                  <TableCell>
                    {/* BUG-10-05: 편집 중일 때 step 드롭다운 표시 */}
                    {editingId === quiz.id ? (
                      <select
                        value={editForm.step}
                        onChange={(e) => setEditForm((f) => ({ ...f, step: Number(e.target.value) }))}
                        className="h-7 text-sm border rounded px-1 bg-background w-14"
                      >
                        {Array.from({ length: MAX_QUIZZES }, (_, i) => i + 1).map((s) => (
                          <option key={s} value={s}>Q{s}</option>
                        ))}
                      </select>
                    ) : (
                      <Badge variant="outline">Q{quiz.step}</Badge>
                    )}
                  </TableCell>
                  {editingId === quiz.id ? (
                    <>
                      <TableCell>
                        <Input
                          value={editForm.question}
                          onChange={(e) => setEditForm((f) => ({ ...f, question: e.target.value }))}
                          className="h-7 text-sm"
                        />
                      </TableCell>
                      <TableCell>
                        {/* BUG-10-03: maxLength 20 */}
                        <Input
                          value={editForm.answer}
                          onChange={(e) => setEditForm((f) => ({ ...f, answer: e.target.value }))}
                          maxLength={ANSWER_MAX_LEN}
                          className="h-7 text-sm"
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => saveEdit(quiz.id)}>
                            <Check className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingId(null)}>
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </>
                  ) : (
                    <>
                      <TableCell className="text-sm">{quiz.question}</TableCell>
                      <TableCell className="text-sm font-medium">{quiz.answer}</TableCell>
                      {!isActive && (
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(quiz)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => deleteQuiz(quiz.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </>
                  )}
                </TableRow>
              ))}

              {/* 수동 추가 행 — BUG-10-04: step Q1~Q5 선택 */}
              {addMode && (
                <TableRow>
                  <TableCell>
                    <select
                      value={newQuiz.step}
                      onChange={(e) => setNewQuiz((n) => ({ ...n, step: Number(e.target.value) }))}
                      className="h-7 text-sm border rounded px-1 bg-background"
                    >
                      {Array.from({ length: MAX_QUIZZES }, (_, i) => i + 1).map((s) => (
                        <option key={s} value={s}>Q{s}</option>
                      ))}
                    </select>
                  </TableCell>
                  <TableCell>
                    <Input
                      value={newQuiz.question}
                      onChange={(e) => setNewQuiz((n) => ({ ...n, question: e.target.value }))}
                      placeholder="질문 입력"
                      className="h-7 text-sm"
                    />
                  </TableCell>
                  <TableCell>
                    {/* BUG-10-03: maxLength 20 */}
                    <Input
                      value={newQuiz.answer}
                      onChange={(e) => setNewQuiz((n) => ({ ...n, answer: e.target.value }))}
                      placeholder={`정답 (${ANSWER_MAX_LEN}자)`}
                      maxLength={ANSWER_MAX_LEN}
                      className="h-7 text-sm"
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleAdd}>
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setAddMode(false)}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
