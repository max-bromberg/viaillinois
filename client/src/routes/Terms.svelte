<script>
  import ReadingPage from '../lib/ReadingPage.svelte';

  /**
   * The terms of use.
   *
   * A reading page: the page title, the dates, and then the document, rather
   * than seventeen bordered cards with one section in each of them. Somebody
   * reading the part about liability should be reading a document.
   */
  const DATELINE = 'Effective September 1, 2026. Last updated September 1, 2026.';
</script>

<svelte:head>
  <title>Terms of Use: VIA</title>
  <meta name="description" content="The terms that apply to using VIA, including acceptable use, content ownership, disclaimers and the limits of liability." />
</svelte:head>

<ReadingPage title="Terms of Use" dateline={DATELINE}>

  <p>
    These terms are an agreement between you and the people who operate VIA. Please read
    them. They include disclaimers and limits on liability in sections 10 and 11 that
    affect your legal rights.
  </p>

  <section>
    <h2>1. Accepting these terms</h2>
    <p>
      By using VIA, whether or not you sign in, you agree to these terms and to the
      <a href="/privacy">Privacy Policy</a>. If you do not agree, do not use
      the platform. If you use VIA on behalf of a registered student organization, you confirm
      that you are authorised to act for it and that it is bound by these terms as well.
    </p>
  </section>

  <section>
    <h2>2. VIA is not the University</h2>
    <p>
      VIA is an independent project built and run by student volunteers. It is not a service
      of the University of Illinois, it is not operated, sponsored, endorsed or approved by
      the University or by the Department of Electrical and Computer Engineering, and nothing
      published here is an official University communication.
    </p>
    <p>
      University names, marks and logos remain the property of the University and are used
      only to describe who this platform serves. Registered student organizations remain
      responsible for their own compliance with University policy.
    </p>
  </section>

  <section>
    <h2>3. What VIA does</h2>
    <p>
      VIA lists events published by registered student organizations, shows a shared exam
      calendar, and gives those organizations tools to manage their own listings. It is
      provided free of charge. It is an index of what other people tell us, and it is not the
      organiser of any event listed on it.
    </p>
  </section>

  <section>
    <h2>4. Eligibility and accounts</h2>
    <p>
      Reading the public event feed requires no account. Creating or managing content
      requires signing in with a University NetID, or with a local account issued by an
      administrator. VIA is intended for members of the University community, and you must be
      at least thirteen years old to hold an account.
    </p>
    <ul>
      <li>You are responsible for everything done through your account.</li>
      <li>Do not share your credentials, and do not use anyone else's account.</li>
      <li>Tell us promptly if you believe your account has been used without your permission.</li>
      <li>An account may be suspended or removed if these terms are broken, or if keeping it would put the platform or its users at risk.</li>
    </ul>
  </section>

  <section>
    <h2>5. Acceptable use</h2>
    <p>
      Use VIA lawfully and for its purpose. You must not:
    </p>
    <ul>
      <li>Post false, misleading or fraudulent event information.</li>
      <li>Impersonate another person, another NetID, or an organization you do not represent.</li>
      <li>Post content that is unlawful, harassing, defamatory, threatening, or that infringes someone else's rights.</li>
      <li>Publish personal information about someone else without their consent.</li>
      <li>Attempt to gain access to accounts, data or systems you are not entitled to, or probe, scan or test the platform's security without written permission.</li>
      <li>Interfere with the platform's operation, including by overloading it or circumventing its rate limits.</li>
      <li>Collect data from the platform by automated means beyond what the published robots file permits, or reuse the listings as a bulk dataset without written permission.</li>
      <li>Use the platform to send unsolicited messages, malware, or advertising unrelated to student organization activity.</li>
    </ul>
  </section>

  <section>
    <h2>6. Content you post</h2>
    <p>
      You keep ownership of what you post. By posting it, you give VIA a non exclusive,
      worldwide, royalty free permission to store, reproduce, adapt for formatting, and
      publish that content for the purpose of running the platform, including on the public
      feed, in the calendar, on lobby displays, in exported calendar files, and in the pages
      that search engines and search assistants read. This permission lasts as long as the
      content is published on VIA and ends when it is removed, except for copies already made
      in backups or by third parties.
    </p>
    <p>
      You confirm that you have the right to post what you post, including anything imported
      from a calendar file, and that doing so breaks no law and infringes nobody's rights.
    </p>
    <p>
      Content posted to the public feed is public. It is indexed by search engines, it can be
      read and repeated by search assistants, and it may be copied by people and systems
      outside our control. Do not post anything you would not want published permanently.
    </p>
    <p>
      The board of an organization is responsible for the accuracy of its listings. VIA may
      remove or edit content that breaks these terms, and may do so without notice where the
      content is unlawful or harmful, but it is under no obligation to review or monitor what
      is posted.
    </p>
  </section>

  <section>
    <h2>7. Copyright complaints</h2>
    <p>
      If you believe something on VIA infringes your copyright, write to <a href="mailto:mzainab2@illinois.edu">mzainab2@illinois.edu</a>,
      identifying the work, the page it appears on, and how to reach you. We will review the report and remove infringing
      material where the claim is substantiated. Accounts that repeatedly infringe will be
      removed.
    </p>
  </section>

  <section>
    <h2>8. Information from other sources</h2>
    <p>
      Some information on VIA comes from elsewhere: room and course data from public
      University systems, exam dates supplied by a student honor society, and calendar files
      uploaded by organizations. VIA reproduces that information and does not verify it. It
      may be wrong, out of date, or incomplete.
    </p>
    <p>
      Always confirm the details with the organization holding an event before you rely on
      them, and confirm exam times with your instructor or the department. Links to other
      sites are provided for convenience, and VIA is not responsible for their content.
    </p>
  </section>

  <section>
    <h2>9. Availability</h2>
    <p>
      VIA is provided on a best effort basis by volunteers. It may be modified, interrupted,
      or discontinued at any time, features may be added or withdrawn, and data may be lost.
      No level of availability is promised, and no notice is guaranteed before a change,
      although we will give notice where it is reasonably practical to do so.
    </p>
  </section>

  <section>
    <h2>10. Disclaimer of warranties</h2>
    <p>
      <strong>
        VIA is provided as is and as available, without warranty of any kind, whether express,
        implied or statutory. To the fullest extent permitted by law, the operators disclaim
        all warranties, including the implied warranties of merchantability, fitness for a
        particular purpose, title, and non infringement, and any warranty that the platform
        will be uninterrupted, timely, secure, accurate, or free of error.
      </strong>
    </p>
    <p>
      Some jurisdictions do not allow the exclusion of certain warranties, so parts of this
      section may not apply to you.
    </p>
  </section>

  <section>
    <h2>11. Limitation of liability</h2>
    <p>
      <strong>
        To the fullest extent permitted by law, the operators of VIA and its contributors
        shall not be liable for any indirect, incidental, special, consequential, exemplary or
        punitive damages, nor for lost data, lost opportunities, or any event you missed,
        attended, or relied on in error, arising out of or connected with your use of the
        platform, whether the claim is brought in contract, tort or otherwise, and even if the
        possibility of such damages was known.
      </strong>
    </p>
    <p>
      <strong>
        The total liability of the operators for all claims relating to the platform shall not
        exceed one hundred United States dollars.
      </strong>
    </p>
    <p>
      Nothing in these terms excludes liability that cannot lawfully be excluded, and some
      jurisdictions do not allow these limits, so parts of this section may not apply to you.
    </p>
  </section>

  <section>
    <h2>12. Indemnity</h2>
    <p>
      You agree to indemnify and hold harmless the operators of VIA and its contributors
      against any claim, loss or expense, including reasonable legal fees, arising from
      content you post, from your use of the platform, or from your breach of these terms.
      This does not apply to the extent the claim arises from the operators' own conduct.
    </p>
  </section>

  <section>
    <h2>13. Ending your use</h2>
    <p>
      You may stop using VIA at any time and ask for your account to be deleted, as described
      in the <a href="/privacy">Privacy Policy</a>. We may suspend or end
      access where these terms are broken or where continuing would put the platform or its
      users at risk. Sections 6, 10, 11, 12 and 14 survive the end of your use.
    </p>
  </section>

  <section>
    <h2>14. Governing law and disputes</h2>
    <p>
      These terms are governed by the laws of the State of Illinois, without regard to its
      conflict of law rules. Any dispute that cannot be resolved informally shall be brought
      exclusively in the state or federal courts located in Champaign County, Illinois, and
      you consent to the jurisdiction of those courts.
    </p>
    <p>
      Before starting any proceeding, please write to <a href="mailto:mzainab2@illinois.edu">mzainab2@illinois.edu</a> and allow thirty days to
      resolve the matter. Most problems with a platform run by volunteers turn out to be fixable by
      asking.
    </p>
  </section>

  <section>
    <h2>15. General</h2>
    <ul>
      <li>If any provision is found unenforceable, the rest remains in effect.</li>
      <li>Not enforcing a provision on one occasion does not waive it.</li>
      <li>You may not transfer your rights under these terms. We may transfer ours to anyone who takes over operation of the platform.</li>
      <li>These terms and the Privacy Policy are the entire agreement between us about VIA, and they replace any earlier version.</li>
    </ul>
  </section>

  <section>
    <h2>16. Changes to these terms</h2>
    <p>
      These terms may change as the platform changes. The effective date above records the
      current version, and material changes will be announced on the platform before they
      take effect. Continuing to use VIA after that means you accept the revised terms.
    </p>
  </section>

  <section>
    <h2>17. Contact</h2>
    <p>
      Questions about these terms should be sent to <a href="mailto:mzainab2@illinois.edu">mzainab2@illinois.edu</a>.
    </p>
  </section>

</ReadingPage>
