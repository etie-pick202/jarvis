import { expect, type Page, test } from "@playwright/test";

/**
 * Parcours de bout en bout sur la vraie API et sa base : chaque écran lit et écrit réellement
 * (aucun faux serveur). Comptes d'essai fictifs créés par la préparation.
 */
test.use({ locale: "fr-FR" });

const MOT_DE_PASSE = process.env.E2E_PASSWORD ?? "";
const unique = () => Date.now().toString(36);

async function seConnecter(page: Page, identifiant: string, motDePasse = MOT_DE_PASSE): Promise<void> {
  await page.goto("/connexion");
  await page.getByLabel("Identifiant").fill(identifiant);
  await page.getByLabel("Mot de passe").fill(motDePasse);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
}

test("connexion réelle : un mauvais mot de passe est refusé, le bon ouvre le tableau de bord", async ({
  page,
}) => {
  await page.goto("/connexion");
  await page.getByLabel("Identifiant").fill("pdg.essai");
  await page.getByLabel("Mot de passe").fill("mauvais-mot-de-passe");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/connexion/u);

  await seConnecter(page, "pdg.essai");
  await expect(page.getByRole("heading", { level: 1, name: "Tableau de bord" })).toBeVisible();
});

test("CoCoConfig : le PDG crée un compte, qui peut ensuite se connecter", async ({ page }) => {
  const id = `caisse.${unique()}`;
  await seConnecter(page, "pdg.essai");
  await page.goto("/config/utilisateurs");
  const fiche = page.getByRole("form", { name: "Nouveau compte" });
  await fiche.getByLabel("Identifiant").fill(id);
  await fiche.getByLabel("Nom affiché").fill("Caissier bout en bout");
  await fiche.getByLabel("Mot de passe provisoire").fill("bout-en-bout-1234");
  await fiche.getByRole("checkbox", { name: "Caissier" }).check();
  await fiche.getByRole("button", { name: "Créer le compte" }).click();
  await expect(fiche.getByText("Compte créé.")).toBeVisible();

  await page.context().clearCookies();
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await seConnecter(page, id, "bout-en-bout-1234");
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
});

test("CoCoMarket : un article ajouté est relu depuis la base après rechargement", async ({ page }) => {
  const nom = `Article bout en bout ${unique()}`;
  await seConnecter(page, "gerant.essai");
  await page.goto("/market/articles");
  const fiche = page.getByRole("form", { name: "Nouvel article" });
  await fiche.getByLabel("Article", { exact: true }).fill(nom);
  await fiche.getByLabel("Prix (FCFA)").fill("2500");
  await page.getByRole("button", { name: "Ajouter l'article" }).click();
  await expect(page.getByText("Article enregistré.")).toBeVisible();

  await page.reload();
  await page.getByRole("searchbox").fill(nom);
  await expect(page.getByRole("rowheader", { name: nom })).toBeVisible();
});

test("vente : sans stock, la marque n'est pas vendable (règle appliquée par l'API)", async ({ page }) => {
  await seConnecter(page, "caissier.essai");
  await page.goto("/vente/nouvelle");
  await expect(page.getByRole("radio", { name: /Alpha Gaz/u })).toBeDisabled();
});

test("CoCoShop : la vitrine publique lit le catalogue réel sans compte", async ({ page }) => {
  await page.goto("/boutique");
  await expect(page.getByRole("heading", { level: 1, name: "Commander à la boutique" })).toBeVisible();
  await expect(page.getByText(/Alpha Gaz/u).first()).toBeVisible();
});

test("droits réels : le caissier n'accède pas à la gestion des comptes", async ({ page }) => {
  await seConnecter(page, "caissier.essai");
  await page.goto("/config/utilisateurs");
  await expect(page.getByRole("button", { name: "Créer le compte" })).toHaveCount(0);
});
