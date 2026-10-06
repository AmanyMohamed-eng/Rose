
import mongoose from "mongoose";

const couponSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: [true, "Coupon code is required"],
      unique: true,
      trim: true,
      uppercase: true,
      minlength: 3,
      maxlength: 20,
    },

    description: {
      type: String,
      trim: true,
      maxlength: 200,
    },

    discountType: {
      type: String,
      enum: ["PERCENTAGE", "FIXED"],
      required: true,
    },

    discountValue: {
      type: Number,
      required: true,
      min: [0.01, "Discount value must be greater than zero"],
    },

    maxDiscountAmount: {
      type: Number,
      min: 0,
      default: null,
    },

    minOrderAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    startDate: {
      type: Date,
      required: true,
    },

    expiryDate: {
      type: Date,
      required: true,
    },

    usageLimit: {
      type: Number,
      default: null,
      min: 1,
    },

    usedCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    usageLimitPerCustomer: {
      type: Number,
      default: 1,
      min: 1,
    },

    usedBy: [
      {
        customer: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        usageCount: {
          type: Number,
          default: 1,
        },
      },
    ],

    isActive: {
      type: Boolean,
      default: true,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Validate percentage discounts
couponSchema.pre("validate", function () {
  if (
    this.discountType === "PERCENTAGE" &&
    this.discountValue > 100
  ) {
    this.invalidate(
      "discountValue",
      "Percentage discount cannot exceed 100%"
    );
  }

  if (
    this.startDate &&
    this.expiryDate &&
    this.expiryDate <= this.startDate
  ) {
    this.invalidate(
      "expiryDate",
      "Expiry date must be after start date"
    );
  }

  if (
    this.usageLimit !== null &&
    this.usedCount > this.usageLimit
  ) {
    this.invalidate(
      "usedCount",
      "Used count cannot exceed usage limit"
    );
  }
});

const Coupon = mongoose.model("Coupon", couponSchema);

export default Coupon;
