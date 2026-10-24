import type { ChapterDefinition } from '../config/chapters';
import type { TaskItem } from '../content';
import { useLanguage } from '../i18n/context';

export function TaskList({
  tasks,
  style,
  title,
}: {
  tasks: TaskItem[];
  style: ChapterDefinition['taskStyle'];
  title?: string;
}) {
  const { t } = useLanguage();
  if (tasks.length === 0) return null;
  const heading = title ?? (tasks.length > 1 ? t.chapter.tasks : t.chapter.task);
  return (
    <section className="tasks" data-style={style} aria-label={heading}>
      <h2 className="eyebrow">{heading}</h2>
      <ol className="tasks__list">
        {tasks.map((task, i) => (
          <li key={`${i}-${task.title}`} className="tasks__item">
            {style !== 'plain' && (
              <span className="tasks__index" aria-hidden="true">
                {style === 'ritual' ? '·' : String(i + 1).padStart(2, '0')}
              </span>
            )}
            <div>
              <p className="tasks__title">{task.title}</p>
              {task.detail && <p className="small-text tasks__detail">{task.detail}</p>}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
