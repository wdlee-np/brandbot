'use client';

import { useRouter } from 'next/navigation';
import ChatWindow from './ChatWindow';

interface Props {
  projectId: string;
  token: string;
  brandName: string;
  initialQuizProgress?: number; // BUG-02-04
}

export default function ChatPageClient({ projectId, token, brandName, initialQuizProgress }: Props) {
  const router = useRouter();

  const handleQuizComplete = () => {
    router.push(`/chat/${projectId}/reward?token=${token}`);
  };

  return (
    <ChatWindow
      projectId={projectId}
      token={token}
      brandName={brandName}
      initialQuizProgress={initialQuizProgress} // BUG-02-04
      onQuizComplete={handleQuizComplete}
    />
  );
}
