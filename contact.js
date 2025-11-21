const contactForm = document.querySelector(".contact-form");
const contactStatus = document.getElementById("contactStatus");
const contactSubmitButton = document.getElementById("contactSubmitButton");
const contactFrame = document.getElementById("contactFormFrame");

if (contactForm && contactStatus && contactSubmitButton && contactFrame) {
  let isSubmittingContact = false;

  const resetContactForm = (message) => {
    contactSubmitButton.disabled = false;
    contactSubmitButton.textContent = "送信する";
    contactStatus.textContent = message;
  };

  contactForm.addEventListener("submit", () => {
    isSubmittingContact = true;
    contactSubmitButton.disabled = true;
    contactSubmitButton.textContent = "送信中...";
    contactStatus.textContent = "送信しています...";
  });

  contactFrame.addEventListener("load", () => {
    if (!isSubmittingContact) return;
    isSubmittingContact = false;
    contactForm.reset();
    resetContactForm("送信が完了しました。ありがとうございました！");
  });
}
