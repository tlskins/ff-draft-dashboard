import Head from "next/head"
import Link from "next/link"

import {
  DRAFTY_HELP_CATALOG,
  DRAFTY_HELP_TOPICS,
} from "../behavior/help/draftyHelp"
import {
  DRAFTY_EXTENSION_STORE_URL,
  DRAFTY_EXTENSION_VERSION,
} from "../behavior/extensionStore"
import styles from "../styles/ExtensionSupport.module.css"


const ExtensionSupport = () => (
  <>
    <Head>
      <title>Drafty setup and support</title>
      <meta
        name="description"
        content="Install Drafty Draft Sync, connect a live fantasy draft, synchronize rankings and targets, and review completed mocks."
      />
    </Head>
    <main className={styles.page}>
      <header className={styles.hero}>
        <p className={styles.eyebrow}>DRAFTY FIELD GUIDE</p>
        <h1>Setup, drafting, and support</h1>
        <p>
          Version {DRAFTY_EXTENSION_VERSION} is approved and available from the Chrome Web Store.
          Use this guide for the dashboard, published extension, cross-device sync, and mock review.
        </p>
        <div className={styles.actions}>
          <a className={styles.primaryAction} href={DRAFTY_EXTENSION_STORE_URL}>
            Install Drafty Draft Sync
          </a>
          <Link href="/">Open Drafty</Link>
        </div>
      </header>

      <nav className={styles.topicNav} aria-label="Help topics">
        {DRAFTY_HELP_TOPICS.map(topic => (
          <a key={topic} href={`#${topic}`}>{DRAFTY_HELP_CATALOG[topic].title}</a>
        ))}
      </nav>

      <div className={styles.guideGrid}>
        {DRAFTY_HELP_TOPICS.map(topic => {
          const article = DRAFTY_HELP_CATALOG[topic]
          return (
            <article className={styles.guide} id={topic} key={topic}>
              <div className={styles.guideHeading}>
                <p className={styles.eyebrow}>{topic.replaceAll("_", " ")}</p>
                <h2>{article.title}</h2>
                <p>{article.summary}</p>
              </div>
              <section>
                <h3>Before you start</h3>
                <ul>{article.prerequisites.map(item => <li key={item}>{item}</li>)}</ul>
              </section>
              <section>
                <h3>Steps</h3>
                <ol>{article.steps.map(item => <li key={item}>{item}</li>)}</ol>
              </section>
              {article.notes.length > 0 && (
                <section>
                  <h3>Good to know</h3>
                  <ul>{article.notes.map(item => <li key={item}>{item}</li>)}</ul>
                </section>
              )}
              {article.troubleshooting.length > 0 && (
                <section className={styles.troubleshooting}>
                  <h3>Troubleshooting</h3>
                  <ul>{article.troubleshooting.map(item => <li key={item}>{item}</li>)}</ul>
                </section>
              )}
              <footer className={styles.guideLinks}>
                {article.links.map(link => (
                  <a key={`${topic}-${link.url}`} href={link.url}>{link.label}</a>
                ))}
              </footer>
            </article>
          )
        })}
      </div>

      <footer className={styles.pageFooter}>
        <a href="/extension-privacy">Privacy policy</a>
        <span>Drafty does not draft players automatically.</span>
      </footer>
    </main>
  </>
)

export default ExtensionSupport
