const mongoose = require("mongoose");

const SIDES = ["CUSTOMER", "FLORIST", "ADMIN"];

const readReceiptSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    side: { type: String, enum: SIDES, required: true },
    readAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const attachmentSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    mimeType: { type: String },
    sizeBytes: { type: Number, min: 0 },
    name: { type: String, maxlength: 120 },
  },
  { _id: false },
);

const messageSchema = new mongoose.Schema(
  {
    conversation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
      index: true,
    },

    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    authorSide: {
      type: String,
      enum: SIDES,
      required: true,
      index: true,
    },

    body: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },
    attachments: { type: [attachmentSchema], default: [] },

    visibleTo: {
      type: [String],
      enum: SIDES,
      required: true,
      index: true,
      validate: [
        {
          validator: (v) => v.length > 0,
          message: "visibleTo cannot be empty",
        },
        {
          validator: (v) => v.includes("ADMIN"),
          message: "visibleTo must always include ADMIN",
        },
      ],
    },

    isInternalNote: { type: Boolean, default: false },

    relayedFrom: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
      default: null,
    },
    relayedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    originalBody: { type: String, default: null },

    readBy: { type: [readReceiptSchema], default: [] },

    deletedAt: { type: Date, default: null, index: true },
    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        delete ret.__v;
        return ret;
      },
    },
  },
);

messageSchema.index({ conversation: 1, createdAt: 1 });
messageSchema.index({ conversation: 1, visibleTo: 1, createdAt: -1 });

messageSchema.index({
  conversation: 1,
  visibleTo: 1,
  authorSide: 1,
  "readBy.side": 1,
});

messageSchema.index({ relayedFrom: 1 });

// NOTE: no `next` callback — Mongoose 9 removed it from hooks (calling it throws "next is not a function").
messageSchema.pre("validate", function normaliseVisibility() {
  if (!this.visibleTo || !this.visibleTo.length) {
    this.visibleTo = [this.authorSide, "ADMIN"];
  }
  if (!this.visibleTo.includes("ADMIN")) {
    this.visibleTo.push("ADMIN");
  }
  this.visibleTo = [...new Set(this.visibleTo)];

  if (this.isInternalNote) {
    this.visibleTo = ["ADMIN"];
  }
});

messageSchema.methods.isVisibleTo = function (side) {
  if (this.deletedAt) return false;
  if (this.isInternalNote && side !== "ADMIN") return false;
  return this.visibleTo.includes(side);
};

messageSchema.methods.isReadBy = function (side) {
  return this.readBy.some((r) => r.side === side);
};

messageSchema.methods.toView = function (viewerSide) {
  const base = {
    _id: this._id,
    conversation: this.conversation,
    authorSide: this.authorSide,
    body: this.deletedAt ? "[deleted]" : this.body,
    attachments: this.deletedAt ? [] : this.attachments,
    isInternalNote: this.isInternalNote,
    // Never expose reader identities (user ids) or other sides' receipts to non-admin viewers: a message relayed
    // to both customer and florist would otherwise reveal each side's user id to the other.
    readBy:
      viewerSide === "ADMIN"
        ? this.readBy
        : this.readBy
            .filter((r) => r.side === viewerSide || r.side === "ADMIN")
            .map((r) => ({ side: r.side, readAt: r.readAt })),
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };

  if (this.author && this.author.name !== undefined) {
    base.author = { name: this.author.name, role: this.author.role };
  }

  if (viewerSide === "ADMIN") {
    base.authorId = this.author?._id || this.author;
    base.relayedFrom = this.relayedFrom;
    base.relayedBy = this.relayedBy;
    base.originalBody = this.originalBody;
    base.deletedAt = this.deletedAt;
    base.deletedBy = this.deletedBy;
  }

  return base;
};

module.exports = mongoose.model("Message", messageSchema);
