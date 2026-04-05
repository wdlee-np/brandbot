import { CalendarOff } from 'lucide-react';

export default function InactivePage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="text-center space-y-4 max-w-xs">
        <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mx-auto">
          <CalendarOff className="h-6 w-6 text-muted-foreground" />
        </div>
        <div className="space-y-1.5">
          <h1 className="text-lg font-semibold">이벤트가 종료되었어요</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            현재 이 이벤트는 진행 중이 아닙니다.
            <br />
            다른 이벤트가 열리면 다시 방문해 주세요!
          </p>
        </div>
      </div>
    </div>
  );
}
