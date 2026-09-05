<script>
  const card = 'rounded-xl p-6 bg-background/95 backdrop-blur-sm border space-y-3';
  const body = 'text-sm text-muted-foreground leading-relaxed';
  const list = 'text-sm text-muted-foreground leading-relaxed list-disc pl-5 space-y-1';
  const link = 'underline underline-offset-2 hover:text-foreground transition-colors';
</script>

<svelte:head>
  <title>Privacy Policy: VIA</title>
  <meta name="description" content="What VIA stores about you, why it stores it, who can see it, and how to have it removed." />
</svelte:head>

<div class="max-w-2xl mx-auto space-y-6">

  <div class="{card}">
    <h1 class="text-3xl font-bold tracking-tight">Privacy Policy</h1>
    <p class="text-xs text-muted-foreground">Effective September 1, 2026. Last updated September 5, 2026.</p>
    <p class="{body}">
      This policy explains what VIA stores about you, why it is stored, who can see it, how
      long it is kept, and how to have it removed. It applies to viaillinois.com and to
      nothing else.
    </p>
  </div>

  <div class="{card}">
    <h2 class="text-lg font-semibold">1. Who runs VIA</h2>
    <p class="{body}">
      VIA is built and operated by student volunteers. It is not a service of the University
      of Illinois, it is not operated or endorsed by the University or by the Department of
      Electrical and Computer Engineering, and the University is not responsible for it. The
      University's own privacy notices do not govern this site.
    </p>
    <p class="{body}">
      Records held by VIA are not education records maintained by the University, and VIA is
      not acting as a school official. If you need something that is an official University
      record, ask the University rather than us.
    </p>
  </div>

  <div class="{card}">
    <h2 class="text-lg font-semibold">2. What VIA collects</h2>

    <h3 class="text-sm font-medium">When you sign in</h3>
    <p class="{body}">
      Signing in is handled by the University's Microsoft Entra tenant using your NetID
      credentials, so VIA never receives or stores your password. Once you have signed in,
      VIA stores your NetID, your display name, and your illinois.edu email address. Some
      accounts also hold an administrator flag.
    </p>
    <p class="{body}">
      A small number of accounts use a local username and password issued by an
      administrator instead. For those, VIA stores a one way hash of the password and never
      the password itself.
    </p>

    <h3 class="text-sm font-medium mt-3">Before you sign in, if a student organization adds you</h3>
    <p class="{body}">
      A registered student organization can record its roster before its members have used
      VIA. When it does, VIA creates a placeholder record holding only the NetID that was
      entered, the organization, the role, and the date it was added. Such a record holds no
      name and no email address, because VIA has none to store. The first time you sign in,
      the placeholder becomes your account and the membership carries over. If you never sign
      in, the record stays as it is, and you can ask us to delete it.
    </p>

    <h3 class="text-sm font-medium mt-3">What you do on the platform</h3>
    <ul class="{list}">
      <li><strong class="text-foreground">Events you create or edit.</strong> Event titles, descriptions, times and locations, along with the account that created them.</li>
      <li><strong class="text-foreground">Responses to events.</strong> If you say you are going to an event, that association is stored and shown to the board of the organization holding it.</li>
      <li><strong class="text-foreground">Organization membership.</strong> Which organizations you belong to and your role in each.</li>
      <li><strong class="text-foreground">Exam entries.</strong> If you submit a midterm date, the entry is stored with the account that submitted it.</li>
    </ul>

    <h3 class="text-sm font-medium mt-3">Data that does not come from you</h3>
    <p class="{body}">
      VIA reads publicly available University sources to fill in rooms and course schedules,
      including Course Explorer and the campus room reservation system, and it accepts
      calendar files uploaded by organization boards. This information describes rooms,
      courses and events rather than people.
    </p>

    <h3 class="text-sm font-medium mt-3">Server logs</h3>
    <p class="{body}">
      The server records ordinary access logs containing the requesting network address, the
      path requested, the response status and a timestamp. They are used to diagnose faults
      and to investigate abuse. They are not used to build a profile of you, and they are not
      combined with your account for any purpose other than investigating a specific problem.
    </p>

    <h3 class="text-sm font-medium mt-3">What VIA does not collect</h3>
    <p class="{body}">
      There are no third party analytics, no advertising trackers, no session recording, and
      no fingerprinting. VIA does not ask for and does not want your date of birth, your
      address, your phone number, your grades, your student identification number, or any
      health, financial or other sensitive information. Please do not put such information
      into event descriptions or any other field.
    </p>
  </div>

  <div class="{card}">
    <h2 class="text-lg font-semibold">3. The Discord link</h2>
    <p class="{body}">
      VIA has a companion bot on Discord, so that the same events and the same organizations
      are present in the servers where those organizations actually run. You can use the bot
      without linking anything. Linking is what lets it act on VIA as you, and this section
      says what that stores.
    </p>

    <h3 class="text-sm font-medium">What is stored when you link</h3>
    <ul class="{list}">
      <li><strong class="text-foreground">The link itself.</strong> Your NetID and the Discord user identifier of the account you linked, with the date you linked. That pair is what lets the bot act as you, and it is stored in the clear because both halves have to be read back.</li>
      <li><strong class="text-foreground">A Discord authorization, only if you chose the linked roles step.</strong> That step is optional, and it is what lets VIA publish three facts to Discord: that you are verified, whether you are on the board of an organization, and the day you linked. Publishing them needs a token from Discord, which is stored encrypted and is used for nothing else. If you declined the step, no token is stored, and you can add it later from your account page.</li>
      <li><strong class="text-foreground">Interest in an event.</strong> When you press an interest button as a linked person, that interest is recorded under your NetID. When you press it without having linked, it is recorded under a salted one way hash of your Discord user identifier instead, which cannot be turned back into the identifier and cannot be matched against a list of identifiers by anybody who does not hold the salt. Boards see a count and never a list of people.</li>
      <li><strong class="text-foreground">Feedback on an event.</strong> A rating from one to five and an optional comment, stored with your NetID so that saying it again replaces what you said before. The board of the organization sees the average, how many people rated the event, and the comments, and it is never told who gave which rating.</li>
      <li><strong class="text-foreground">A personal calendar address.</strong> If you ask the bot for a calendar to subscribe to, VIA stores a one way hash of the address and the organizations the calendar follows, never the address itself. The address is the whole of the credential for that calendar, so treat it as private and ask for a new one if you have shared it by accident, which makes the old one stop working.</li>
    </ul>

    <h3 class="text-sm font-medium mt-3">What the bot never does</h3>
    <p class="{body}">
      The bot never reads your messages. It does not ask Discord for permission to see message
      content anywhere, and it stores no message text. Text reaches it only inside a command or
      a form you deliberately filled in, and it is used for that and then discarded. Nothing you
      do on this website is posted to Discord as you.
    </p>

    <h3 class="text-sm font-medium mt-3">How long it is kept</h3>
    <ul class="{list}">
      <li><strong class="text-foreground">The link and any stored authorization.</strong> Until you unlink, or until you ask us to delete your account.</li>
      <li><strong class="text-foreground">A link request.</strong> The short lived record created when you start linking lasts ten minutes and is deleted a day after it runs out, whether it was used or not.</li>
      <li><strong class="text-foreground">Interest and feedback.</strong> Kept with the event they are about, as the rest of an organization's record of what it has run.</li>
      <li><strong class="text-foreground">The calendar address hash.</strong> Until you ask for a new address, which replaces it, or until your account is deleted.</li>
    </ul>

    <h3 class="text-sm font-medium mt-3">How to remove it</h3>
    <p class="{body}">
      You can unlink at any time, from either side: use the unlink button on your
      <a href="/account" class="{link}">account page</a> here, or run the unlink command on
      Discord. Either one deletes the link and any stored Discord authorization, and clears the
      linked roles facts VIA published about you, so a server that gave you a role for them can
      take it away. Interest recorded under a hash cannot be traced back to you and so cannot be
      found and removed on request. If you would like your feedback removed as well, write to us
      and say so.
    </p>
  </div>

  <div class="{card}">
    <h2 class="text-lg font-semibold">4. Cookies</h2>
    <p class="{body}">
      VIA sets one cookie of its own, named
      <code class="font-mono text-xs bg-muted px-1 py-0.5 rounded">via_token</code>. It holds
      a signed token identifying your account, it cannot be read by scripts in your browser,
      it is sent only to this site, and it is transmitted only over an encrypted connection
      in production. A second short lived cookie exists only during the sign in redirect and
      expires as soon as sign in finishes.
    </p>
    <p class="{body}">
      Neither cookie contains tracking identifiers, and no third party sets cookies through
      VIA. Browsing without signing in sets no cookies at all, which is why there is no
      cookie banner. Your theme preference is kept in your browser's local storage and never
      reaches the server.
    </p>
  </div>

  <div class="{card}">
    <h2 class="text-lg font-semibold">5. Why VIA holds this information</h2>
    <ul class="{list}">
      <li>To sign you in and keep you signed in.</li>
      <li>To show which organizations you belong to, and to let their boards manage events.</li>
      <li>To attribute events and responses to the account that created them.</li>
      <li>To publish event listings, which is the purpose of the site.</li>
      <li>To keep the platform working and to investigate faults and abuse.</li>
    </ul>
    <p class="{body}">
      VIA does not use your information for advertising, for profiling, for training machine
      learning models, or for anything unrelated to running this platform, and it never sells
      it.
    </p>
  </div>

  <div class="{card}">
    <h2 class="text-lg font-semibold">6. What other people can see</h2>
    <ul class="{list}">
      <li><strong class="text-foreground">Anyone, including people who are not signed in.</strong> Public events, with their title, description, time, location and the organization holding them. These pages are indexed by search engines and can be read by the crawlers behind search assistants, so treat anything you put in an event as public and permanent.</li>
      <li><strong class="text-foreground">Any signed in user.</strong> The names and roles of an organization's members, and events an organization has marked internal if you belong to that organization.</li>
      <li><strong class="text-foreground">The board of an organization you belong to.</strong> Your NetID, your illinois.edu email address, the date you joined, and your responses to that organization's events.</li>
      <li><strong class="text-foreground">Platform administrators.</strong> All of the above, for the purpose of running the platform.</li>
    </ul>
    <p class="{body}">
      Events marked internal are excluded from search engine indexing and from the sitemap.
      That reduces the chance of them being found, and it is not a security control: anyone
      signed in who belongs to the organization can see them.
    </p>
  </div>

  <div class="{card}">
    <h2 class="text-lg font-semibold">7. Who else processes your information</h2>
    <p class="{body}">
      VIA does not sell, rent, or trade personal information, and it shares it only with the
      following, each of which is necessary to run the service.
    </p>
    <ul class="{list}">
      <li><strong class="text-foreground">Microsoft.</strong> Sign in is processed by the University's Microsoft Entra tenant. Microsoft's handling is governed by the <a href="https://privacy.microsoft.com" class="{link}" target="_blank" rel="noopener noreferrer">Microsoft Privacy Statement</a>.</li>
      <li><strong class="text-foreground">The hosting provider.</strong> VIA runs on a single rented virtual server, with its database on the same machine. The provider has physical and administrative access to that machine in the ordinary course of operating it.</li>
    </ul>
    <p class="{body}">
      Information may also be disclosed if VIA is required to do so by law, or where
      disclosure is necessary to investigate a credible threat to someone's safety or to the
      integrity of the platform.
    </p>
  </div>

  <div class="{card}">
    <h2 class="text-lg font-semibold">8. How long it is kept</h2>
    <ul class="{list}">
      <li><strong class="text-foreground">Account records.</strong> Until you ask for deletion, or until the platform stops operating.</li>
      <li><strong class="text-foreground">Placeholder records for people who never signed in.</strong> Until the organization removes them or you ask for deletion.</li>
      <li><strong class="text-foreground">Events and responses.</strong> Retained after the event has passed, so that organizations keep a record of what they have run.</li>
      <li><strong class="text-foreground">Server logs.</strong> Kept for a short period for fault diagnosis and then discarded.</li>
      <li><strong class="text-foreground">Database backups.</strong> A backup is taken before every deployment and a small number of the most recent are retained on the same server. A deletion request is applied to the live database immediately, and the deleted information can persist in those backups until they are rotated out.</li>
    </ul>
  </div>

  <div class="{card}">
    <h2 class="text-lg font-semibold">9. How it is protected</h2>
    <p class="{body}">
      Traffic is encrypted in transit. Passwords for local accounts are stored only as
      hashes. The session cookie cannot be read by scripts. Access to the database and to the
      server is limited to the people who operate the platform, and the database is not
      reachable from the public internet.
    </p>
    <p class="{body}">
      No system is perfectly secure, and VIA is run by volunteers rather than by a staffed
      security team. If VIA becomes aware of a breach affecting your information, we will
      publish a notice on the platform and, where we hold an address for you, contact you
      directly, without unreasonable delay. If you believe you have found a vulnerability,
      please report it to <a href="mailto:mzainab2@illinois.edu" class="{link}">mzainab2@illinois.edu</a> rather than testing it against other people's accounts.
    </p>
  </div>

  <div class="{card}">
    <h2 class="text-lg font-semibold">10. Your choices and rights</h2>
    <p class="{body}">
      You may ask us to tell you what VIA holds about you, to correct it, or to delete it.
      Write to <a href="mailto:mzainab2@illinois.edu" class="{link}">mzainab2@illinois.edu</a>, and we aim to respond within thirty days. We may need to confirm that the request comes from
      the account holder before acting on it.
    </p>
    <p class="{body}">
      Deleting your account removes your profile, your memberships and your event responses.
      Events published by an organization are that organization's record and are not removed
      by deleting your account, though the account that created them stops being identified.
      You can also stop signing in at any time, and browse the public feed without an
      account.
    </p>
    <p class="{body}">
      Depending on where you live, you may have further rights over your information under
      local law. Ask us and we will do our best to honour them.
    </p>
  </div>

  <div class="{card}">
    <h2 class="text-lg font-semibold">11. Children</h2>
    <p class="{body}">
      VIA is intended for members of the University community and is not directed at children
      under thirteen. We do not knowingly collect information from them. If you believe a
      child has provided information to VIA, write to <a href="mailto:mzainab2@illinois.edu" class="{link}">mzainab2@illinois.edu</a> and we will delete it.
    </p>
  </div>

  <div class="{card}">
    <h2 class="text-lg font-semibold">12. Changes to this policy</h2>
    <p class="{body}">
      This policy may change as the platform changes. The effective date above records the
      current version. If a change materially reduces the protection given to information
      already held, we will post a notice on the platform before it takes effect. Continuing
      to use VIA after a change takes effect means you accept the revised policy.
    </p>
  </div>

  <div class="{card}">
    <h2 class="text-lg font-semibold">13. Contact</h2>
    <p class="{body}">
      Questions about this policy, and requests about your information, should be sent to
      <a href="mailto:mzainab2@illinois.edu" class="{link}">mzainab2@illinois.edu</a>. The <a href="/terms" class="{link}">Terms of Use</a> govern your use of the
      platform alongside this policy.
    </p>
  </div>

</div>
