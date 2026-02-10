# Design System Reference

## Typography System

### Font Sizes
- `$font-size-xs`: 0.75rem (12px)
- `$font-size-sm`: 0.813rem (13px)
- `$font-size-base`: 0.875rem (14px) - **Default**
- `$font-size-md`: 0.938rem (15px)
- `$font-size-lg`: 1rem (16px)
- `$font-size-xl`: 1.125rem (18px)
- `$font-size-2xl`: 1.25rem (20px)
- `$font-size-3xl`: 1.5rem (24px)
- `$font-size-4xl`: 1.875rem (30px)
- `$font-size-5xl`: 2.25rem (36px)

### Headings
- `h1`: 30px (1.875rem)
- `h2`: 24px (1.5rem)
- `h3`: 20px (1.25rem)
- `h4`: 18px (1.125rem)
- `h5`: 16px (1rem)
- `h6`: 14px (0.875rem)

### Font Weights
- `$font-weight-normal`: 400
- `$font-weight-medium`: 500
- `$font-weight-semibold`: 600
- `$font-weight-bold`: 700

### Line Heights
- `$line-height-tight`: 1.25
- `$line-height-normal`: 1.5
- `$line-height-relaxed`: 1.75

## Spacing System

- `$spacing-0`: 0
- `$spacing-1`: 0.25rem (4px)
- `$spacing-2`: 0.5rem (8px)
- `$spacing-3`: 0.75rem (12px)
- `$spacing-4`: 1rem (16px)
- `$spacing-5`: 1.25rem (20px)
- `$spacing-6`: 1.5rem (24px)
- `$spacing-8`: 2rem (32px)
- `$spacing-10`: 2.5rem (40px)
- `$spacing-12`: 3rem (48px)
- `$spacing-16`: 4rem (64px)

## Component Sizes

### Input Heights
- `$input-height-sm`: 2rem (32px)
- `$input-height`: 2.25rem (36px) - **Default**
- `$input-height-lg`: 2.5rem (40px)

### Button Padding
```scss
.btn-sm { padding: 0.25rem 0.75rem; }
.btn    { padding: 0.5rem 1rem; }
.btn-lg { padding: 0.625rem 1.5rem; }
```

### Card Padding
- `$card-padding`: 1.25rem (20px) - **Default**
- `$card-padding-sm`: 1rem (16px)

## Border Radius
- `$border-radius-sm`: 0.375rem (6px)
- `$border-radius`: 0.5rem (8px) - **Default**
- `$border-radius-lg`: 0.75rem (12px)
- `$border-radius-xl`: 1rem (16px)

## Usage Examples

### In Component SCSS Files

```scss
@import '../../../assets/styles/variables';

.my-component {
  font-size: $font-size-sm;
  padding: $spacing-4;
  border-radius: $border-radius;

  h2 {
    font-size: $h2-font-size;
    margin-bottom: $spacing-3;
  }

  .compact-text {
    font-size: $font-size-xs;
    line-height: $line-height-tight;
  }
}
```

### Global Changes Applied

✅ **Base font size**: Changed from 16px to 14px (more compact)
✅ **All headings**: Proportionally reduced
✅ **Buttons**: Smaller padding and font sizes
✅ **Form controls**: More compact with 36px height (was ~40px)
✅ **Cards**: Reduced padding to 20px (was 24px+)
✅ **Labels**: Smaller font size (13px)

## Benefits

1. **Consistent sizing** across the entire application
2. **More content** visible on screen
3. **Professional look** - not too big, not too small
4. **Easy to maintain** - change variables in one place
5. **Reusable** - import and use anywhere

## Before & After

### Before:
- Base font: 16px
- Buttons: Large padding
- Forms: ~40px+ height
- Cards: Lots of whitespace

### After:
- Base font: 14px (more readable, more content)
- Buttons: Compact, professional
- Forms: 36px height (standard)
- Cards: Balanced padding

---

**Note**: All sizing is now consistent and uses the design system variables. To adjust globally, just change the variables in `_variables.scss`.
