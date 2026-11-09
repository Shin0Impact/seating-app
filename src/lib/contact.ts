// How to reach the app's owner (shown when an account needs something only the owner can do, like more events).
export const CONTACT_EMAIL = 'maherbathish@gmail.com';
export const CONTACT_WHATSAPP = '972502600278'; // international format, digits only
export const whatsappLink = (text: string) => `https://wa.me/${CONTACT_WHATSAPP}?text=${encodeURIComponent(text)}`;
export const mailLink = (subject: string) => `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}`;
