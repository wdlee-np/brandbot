'use client';

import ChatWindow from './ChatWindow';

interface Props {
  projectId: string;
  token: string;
  brandName: string;
  initialQuizProgress?: number; // BUG-02-04
}

export default function ChatPageClient({ projectId, token, brandName, initialQuizProgress }: Props) {
  return (
    <ChatWindow
      projectId={projectId}
      token={token}
      brandName={brandName}
      initialQuizProgress={initialQuizProgress} // BUG-02-04
    />
  );
}
