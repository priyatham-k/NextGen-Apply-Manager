import mongoose, { Document, Schema } from 'mongoose';

/**
 * Credentials for the Chrome extension. The extension never sees the user's login JWT:
 * it exchanges a short-lived pairing code (shown in the web app) for its own revocable token.
 * Only SHA-256 hashes are stored.
 */
export interface IExtensionToken extends Document {
  userId: mongoose.Types.ObjectId;
  /** Hash of the one-time pairing code shown in the web app (before pairing) */
  pairingCodeHash?: string;
  pairingExpiresAt?: Date;
  /** Hash of the long-lived token the extension sends as "Bearer ext_…" (after pairing) */
  tokenHash?: string;
  label: string;
  pairedAt?: Date;
  lastUsedAt?: Date;
  revokedAt?: Date;
  createdAt: Date;
}

const extensionTokenSchema = new Schema<IExtensionToken>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    pairingCodeHash: { type: String, index: true, sparse: true },
    pairingExpiresAt: { type: Date },
    tokenHash: { type: String, index: true, sparse: true },
    label: { type: String, default: 'Chrome extension' },
    pairedAt: { type: Date },
    lastUsedAt: { type: Date },
    revokedAt: { type: Date }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const ExtensionToken = mongoose.model<IExtensionToken>('ExtensionToken', extensionTokenSchema);
