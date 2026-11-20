import { parsePotId, potIdToString } from '../domain/amounts';
import {
  bindEventMetadata,
  type EventMetadataContext,
  type EventMetadataLocale,
} from '../domain/eventMetadata';
import styles from './EventBrief.module.css';

export interface EventBriefProps {
  metadata?: unknown;
  context: EventMetadataContext | null;
  potId: bigint | string;
  locale?: EventMetadataLocale;
  headingLevel?: 2 | 3;
}

const copy = {
  en: {
    pot: 'Pot',
    fictional: 'Fictional demo, not a real pilot. No real person or private venue is represented.',
    authority: 'Descriptive context only, not proof of ownership or attendance. Amounts, token and deadlines come from chain state, not this description.',
  },
  vi: {
    pot: 'Quỹ',
    fictional: 'Minh họa hư cấu, không phải thí điểm thực tế. Không đại diện cho cá nhân hay địa điểm riêng tư nào.',
    authority: 'Chỉ là mô tả, không chứng minh quyền sở hữu hay sự hiện diện. Số tiền, token và thời hạn lấy từ trạng thái trên chuỗi, không từ mô tả này.',
  },
} as const;

/** Read-only context; callers retain exclusive responsibility for repository/chain facts. */
export function EventBrief({ metadata, context, potId, locale = 'en', headingLevel = 2 }: EventBriefProps) {
  const language = locale === 'vi' ? 'vi' : 'en';
  const text = copy[language];
  const Heading = headingLevel === 3 ? 'h3' : 'h2';
  let id: string | null = null;
  try {
    id = typeof potId === 'bigint' ? potIdToString(potId) : parsePotId(potId).toString();
    if (typeof potId === 'string' && id !== potId) id = null;
  } catch { /* A malformed target is never echoed as trusted identity. */ }
  const event = id ? bindEventMetadata(metadata, context, id) : null;
  const label = id ? `${text.pot} #${id}` : text.pot;

  if (!event) return <Heading className={styles.title} lang={language}>{label}</Heading>;

  return <section className={styles.brief} lang={language}>
    <Heading className={styles.title}>{event.locales[language].title}</Heading>
    <p className={styles.identity}>{label}</p>
    <p>{event.locales[language].description}</p>
    <p className={styles.disclosure}><strong>{text.fictional}</strong></p>
    <p className={styles.authority}>{text.authority}</p>
  </section>;
}
