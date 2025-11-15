// Bridge controllers to legacy implementations
// Keep API-Gateway server imports stable while reusing legacy logic
export { tabClose, tabAttach } from '../../../legacy/controllers/browserExtraController.js';
export { tabCloseUnmatched } from '../../../legacy/controllers/browserExtraController.js';

