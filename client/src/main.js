import { mount } from 'svelte'
import './app.css'
import App from './App.svelte'

// The server puts a readable summary of the page in the document so that
// crawlers, and anything else that does not run scripts, have something to
// read. It is removed here because the application is about to render the
// same thing properly.
document.getElementById('seo-content')?.remove()

const app = mount(App, {
  target: document.getElementById('app'),
})

export default app
