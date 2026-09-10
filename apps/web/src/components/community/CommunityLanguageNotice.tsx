'use client';

import { Modal } from '@/components/Modal';
import { ApiError } from '@/lib/auth/api';

export const COMMUNITY_LANGUAGE_BLOCKED = 'COMMUNITY_LANGUAGE_BLOCKED';

export function isCommunityLanguageBlocked(err: unknown): boolean {
  return err instanceof ApiError && err.code === COMMUNITY_LANGUAGE_BLOCKED;
}

/** Pop-up quando a API recusa publicação/comentário por xingamento ou linguagem adulta. */
export function CommunityLanguageNotice({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Modal
      title="Comentário não publicado"
      open={open}
      onClose={onClose}
      footer={
        <button type="button" className="btn btn-primary" onClick={onClose}>
          Entendi
        </button>
      }
    >
      <p>
        Sua mensagem foi recusada porque contém xingamentos ou linguagem
        explícita. A comunidade é um espaço escolar — reescreva o texto com
        respeito, sem palavrões nem conteúdo adulto.
      </p>
    </Modal>
  );
}
