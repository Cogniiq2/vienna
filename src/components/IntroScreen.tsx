import { useLanguage } from '../i18n/context';
import { useTripStore } from '../state/context';
import { ArrowIcon } from './Icons';
import { Reveal } from './Reveal';
import { useLeaveTransition } from './useLeaveTransition';

/** Ein Brief in kurzen Absätzen – man scrollt durch, jede Passage erscheint, wenn sie in den Blick kommt. */
export function IntroScreen() {
  const { t } = useLanguage();
  const store = useTripStore();
  const { leaving, leave } = useLeaveTransition(() => store.advanceTo('journey'));
  const { intro } = t;

  return (
    <section className={`intro story ${leaving ? 'screen-leave' : ''}`} aria-labelledby="intro-title">
      <div className="story__screen story__screen--quiet">
        <h1 id="intro-title" className="visually-hidden">
          {intro.turn}
        </h1>
        {intro.before.map((line, i) => (
          <Reveal key={line} delay={i * 350}>
            <p className={i === 1 ? 'body-text intro__list' : 'serif-lead'}>{line}</p>
          </Reveal>
        ))}
      </div>

      <div className="story__screen story__screen--turn">
        <Reveal>
          <p className="display intro__turn">{intro.turn}</p>
        </Reveal>
      </div>

      <div className="story__screen">
        {intro.after.map((line, i) => (
          <Reveal key={line} delay={i * 300}>
            <p className="serif-lead">{line}</p>
          </Reveal>
        ))}
      </div>

      <div className="story__screen story__screen--letter">
        <Reveal>
          <p className="body-text">{intro.highlightLead}</p>
        </Reveal>
        {intro.highlight.map((line, i) => (
          <Reveal key={line} delay={300 + i * 450}>
            <p className={i === 0 ? 'headline intro__name' : 'serif-quote'}>{line}</p>
          </Reveal>
        ))}
        <Reveal delay={600}>
          <div className="page__action">
            <button type="button" className="btn btn--primary btn--large" onClick={leave} disabled={leaving}>
              <span>{intro.cta}</span>
              <ArrowIcon size={18} />
            </button>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
