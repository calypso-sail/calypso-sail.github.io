import './styles/index.css'

import { FLAGS, news } from './content.js'
import { html, qs, setHtml } from './lib/dom.js'
import { newsStory } from './sections/render.js'
import { initReveals } from './sections/reveal.js'

if (FLAGS.SHOW_NEWS) {
  qs('.news-page__main').hidden = false
  setHtml(
    qs('[data-news-index]'),
    html`${news.map((story) => html`<li>${newsStory(story)}</li>`)}`,
  )
  initReveals()
} else {
  window.location.replace(import.meta.env.BASE_URL)
}
