import { ChangeDetectionStrategy, Component } from '@angular/core';

/** Shown on the terms; change it with any change to the text below. */
export const TERMS_UPDATED_ON = '2 novembre 2026';

/**
 * Plano's terms of use and privacy notice, shown on their own page and in the
 * sign-up dialog. Facts it states (30-day sessions, 30-minute reset links, no
 * third-party trackers, hosting) must stay true when the app changes.
 */
@Component({
  selector: 'app-terms-content',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p class="updated">Dernière mise à jour : {{ updatedOn }}</p>

    <section>
      <h3>1. Objet</h3>
      <p>
        Plano est une application de planification (listes, agenda, objectifs, groupes et amis) éditée par
        Synapse Engineering, établie en Belgique. Ces conditions encadrent son utilisation. Créer un compte
        signifie que vous les acceptez.
      </p>
      <p>Contact : <a href="mailto:contact@synapseengineering.dev">contact&#64;synapseengineering.dev</a></p>
    </section>

    <section>
      <h3>2. Votre compte</h3>
      <ul>
        <li>Vous devez avoir au moins 13 ans pour créer un compte.</li>
        <li>Les informations que vous donnez (nom, adresse e-mail) doivent être exactes.</li>
        <li>Votre mot de passe est personnel : gardez-le secret. Vous êtes responsable de ce qui est fait avec votre compte.</li>
        <li>Un compte correspond à une seule personne.</li>
      </ul>
    </section>

    <section>
      <h3>3. Règles de conduite</h3>
      <p>En utilisant Plano, vous vous engagez à ne pas :</p>
      <ul>
        <li>publier ou partager un contenu illégal, haineux, violent, harcelant ou qui porte atteinte aux droits d’autrui ;</li>
        <li>vous faire passer pour quelqu’un d’autre ;</li>
        <li>envoyer des invitations ou des demandes d’ami non sollicitées en masse ;</li>
        <li>tenter d’accéder au compte ou aux données d’une autre personne ;</li>
        <li>perturber le service : contourner ses limites, l’automatiser de manière abusive ou y introduire du code malveillant.</li>
      </ul>
    </section>

    <section>
      <h3>4. Vos contenus et le partage</h3>
      <p>
        Vos listes, objectifs, événements, commentaires et votre photo vous appartiennent. Vous nous autorisez
        seulement à les conserver et à les afficher aux personnes avec qui vous choisissez de les partager, le
        temps nécessaire au fonctionnement du service. Vous êtes responsable de ce que vous partagez.
      </p>
      <p>
        Les personnes avec qui vous partagez (amis, membres de vos groupes, invités d’une liste ou d’un objectif)
        voient votre prénom, votre nom, votre nom d’utilisateur, votre photo et ce que vous partagez avec elles.
        Votre adresse e-mail n’est jamais montrée aux autres utilisateurs.
      </p>
    </section>

    <section>
      <h3>5. Le service</h3>
      <p>
        Plano est fourni gratuitement, tel quel. Nous faisons de notre mieux pour qu’il reste disponible et que
        vos données soient conservées, mais nous ne pouvons pas le garantir : gardez une copie de ce qui est
        important pour vous. Le service peut évoluer, être interrompu pour maintenance ou s’arrêter ; dans ce
        dernier cas, nous vous préviendrons à l’avance.
      </p>
    </section>

    <section>
      <h3>6. Suspension et suppression</h3>
      <p>
        Nous pouvons suspendre ou supprimer un compte qui ne respecte pas ces conditions. Vous pouvez demander la
        suppression de votre compte et de vos données à tout moment en écrivant à l’adresse de contact.
      </p>
    </section>

    <section>
      <h3>7. Responsabilité</h3>
      <p>
        Dans les limites permises par la loi, Synapse Engineering n’est pas responsable des dommages indirects
        liés à l’utilisation de Plano, ni des contenus publiés par les autres utilisateurs. Rien dans ces
        conditions ne limite les droits que la loi vous accorde en tant que consommateur.
      </p>
    </section>

    <section id="terms-privacy">
      <h3>8. Politique de confidentialité</h3>
      <p>
        Synapse Engineering est responsable du traitement de vos données personnelles, conformément au Règlement
        général sur la protection des données (RGPD).
      </p>
      <h4>Ce que nous conservons</h4>
      <ul>
        <li>Votre prénom, votre nom, votre nom d’utilisateur, votre adresse e-mail et votre langue.</li>
        <li>Votre mot de passe, jamais en clair : seulement une empreinte qui ne permet pas de le retrouver.</li>
        <li>Votre photo de profil, si vous en ajoutez une.</li>
        <li>Ce que vous créez dans l’application et la date à laquelle vous avez accepté ces conditions.</li>
        <li>Votre adresse IP, le temps de limiter les abus (trop de tentatives de connexion par exemple).</li>
      </ul>
      <h4>Pourquoi</h4>
      <p>
        Pour faire fonctionner le service que vous demandez (article 6.1.b du RGPD) et pour le protéger contre
        les abus (intérêt légitime, article 6.1.f). Nous ne vendons pas vos données, nous n’affichons pas de
        publicité et l’application ne contient aucun traceur ni service tiers.
      </p>
      <h4>Cookies</h4>
      <p>
        Un seul cookie, indispensable : celui qui vous garde connecté, pendant 30 jours au plus. Votre
        navigateur garde aussi quelques préférences d’affichage sur votre appareil.
      </p>
      <h4>Où et combien de temps</h4>
      <p>
        Vos données sont hébergées sur un serveur loué à OVHcloud (OVH SAS, France). Les e-mails, comme les liens
        de réinitialisation du mot de passe (valables 30 minutes), partent de notre propre serveur de messagerie.
        Nous gardons vos données tant que votre compte existe, puis nous les supprimons.
      </p>
      <h4>Vos droits</h4>
      <p>
        Vous pouvez accéder à vos données, les corriger, les recevoir dans un format réutilisable, demander leur
        effacement, en limiter l’usage ou vous y opposer : écrivez à l’adresse de contact. Vous pouvez aussi
        introduire une plainte auprès de l’Autorité de protection des données
        (<a href="https://www.autoriteprotectiondonnees.be" target="_blank" rel="noopener">autoriteprotectiondonnees.be</a>).
      </p>
    </section>

    <section>
      <h3>9. Modifications</h3>
      <p>
        Nous pouvons modifier ces conditions. La date en haut de cette page indique la dernière version ; en cas
        de changement important, nous vous en informerons dans l’application.
      </p>
    </section>

    <section>
      <h3>10. Droit applicable</h3>
      <p>
        Ces conditions sont soumises au droit belge. En cas de litige, et à défaut d’accord amiable, les
        tribunaux de Bruxelles sont compétents, sans préjudice des règles qui vous permettent, en tant que
        consommateur, de saisir les tribunaux de votre domicile.
      </p>
    </section>
  `,
  styles: `
    :host { display: block; color: var(--color-text); font-size: .8rem; line-height: 1.5; }
    .updated { margin: 0 0 1rem; color: var(--color-text-muted); font-size: .72rem; }
    section + section { margin-top: 1.1rem; }
    h3 { margin: 0 0 .35rem; font-size: .88rem; letter-spacing: -.01em; }
    h4 { margin: .7rem 0 .2rem; font-size: .8rem; }
    p { margin: 0 0 .45rem; }
    ul { margin: 0 0 .45rem; padding-left: 1.1rem; }
    li + li { margin-top: .2rem; }
    a { color: var(--color-primary); font-weight: 600; }
  `,
})
export class TermsContentComponent {
  readonly updatedOn = TERMS_UPDATED_ON;
}
