import { LinkIcon } from 'lucide-react';

export default function BlockedPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="text-center space-y-4 max-w-xs">
        <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mx-auto">
          <LinkIcon className="h-6 w-6 text-muted-foreground" />
        </div>
        <div className="space-y-1.5">
          <h1 className="text-lg font-semibold">링크가 만료되었어요</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            이 링크는 사용할 수 없습니다.
            <br />
            QR코드를 다시 스캔하거나 담당자에게 문의해 주세요.
          </p>
        </div>
      </div>
    </div>
  );
}
