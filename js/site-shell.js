export const siteConfig = window.siteConfig ?? {};

export function applySiteChrome() {
  const brandName = siteConfig.brand?.name ?? "Montford Reserve Metals";
  const brandMark = siteConfig.brand?.mark ?? "MR";
  const brandDescriptor = siteConfig.brand?.descriptor ?? "Buyers of Gold, Silver & Fine Jewelry";
  const brandEmail = siteConfig.brand?.email ?? "privateoffice@example.com";
  const phoneDisplay = siteConfig.brand?.phoneDisplay ?? "(561) 555-0188";
  const phoneHref = siteConfig.brand?.phoneHref ?? "+15615550188";
  const founderName = siteConfig.founder?.name ?? "James Montford";
  const founderTitle = siteConfig.founder?.title ?? "Director of Private Acquisitions";

  document.querySelectorAll("[data-brand-name]").forEach((node) => {
    node.textContent = brandName;
  });

  document.querySelectorAll("[data-brand-mark]").forEach((node) => {
    node.textContent = brandMark;
  });

  document.querySelectorAll("[data-brand-descriptor]").forEach((node) => {
    node.textContent = brandDescriptor;
  });

  document.querySelectorAll("[data-contact-email]").forEach((node) => {
    node.textContent = brandEmail;
    node.setAttribute("href", `mailto:${brandEmail}`);
  });

  document.querySelectorAll("[data-contact-phone]").forEach((node) => {
    node.textContent = phoneDisplay;
    node.setAttribute("href", `tel:${phoneHref}`);
  });

  document.querySelectorAll("[data-founder-name]").forEach((node) => {
    node.textContent = founderName;
  });

  document.querySelectorAll("[data-founder-title]").forEach((node) => {
    node.textContent = founderTitle;
  });

  const currentYear = document.getElementById("current-year");
  if (currentYear) {
    currentYear.textContent = new Date().getFullYear();
  }
}

export function initRevealAnimations() {
  const revealElements = document.querySelectorAll(".reveal");

  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.18 });

    revealElements.forEach((element) => observer.observe(element));
    return;
  }

  revealElements.forEach((element) => element.classList.add("is-visible"));
}
