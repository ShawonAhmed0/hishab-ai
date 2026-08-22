import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ErrorSummary, Field, FieldLabel, Select } from "./field";

/**
 * The two things in `field.tsx` that CLAUDE.md calls load-bearing.
 *
 * Both are easy to undo by accident, because both look like defensive code
 * somebody added for no reason — an odd `onWheel` on a native control, and a
 * component that renders a box with nothing in it. Neither is. This is the
 * X.6 regression test the spec asks for.
 */

describe("R4.5 — a <select> must not change on the wheel", () => {
  /**
   * The bug: a focused native `<select>` changes its value when the wheel
   * passes over it. Scrolling back down a long form after a failed submit
   * therefore silently reselected products and units — the spec's "inputs
   * change on every selection".
   *
   * The fix drops focus rather than preventing the scroll, because a select
   * that eats the page scroll is its own bug.
   */
  function renderSelect() {
    render(
      <Field fieldId="unitId">
        <FieldLabel>একক</FieldLabel>
        <Select defaultValue="kg">
          <option value="kg">কেজি</option>
          <option value="pcs">পিস</option>
        </Select>
      </Field>,
    );
    return screen.getByRole("combobox") as HTMLSelectElement;
  }

  it("blurs itself when the wheel passes over it while focused", () => {
    const select = renderSelect();
    select.focus();
    expect(document.activeElement).toBe(select);

    fireEvent.wheel(select, { deltaY: 120 });

    // Not focused any more, so the browser's own wheel-to-change behaviour has
    // nothing to act on for the rest of the scroll.
    expect(document.activeElement).not.toBe(select);
  });

  it("leaves an unfocused select alone", () => {
    const select = renderSelect();
    // Something else has focus: scrolling past is just scrolling past, and
    // stealing blur from another element would be its own bug.
    const elsewhere = document.createElement("button");
    document.body.appendChild(elsewhere);
    elsewhere.focus();

    fireEvent.wheel(select, { deltaY: 120 });

    expect(document.activeElement).toBe(elsewhere);
  });

  it("does not swallow the page scroll", () => {
    const select = renderSelect();
    select.focus();

    // `fireEvent.wheel` reports whether anything called preventDefault. The
    // fix must not: a control that eats the scroll is the bug in a new shape.
    const notPrevented = fireEvent.wheel(select, { deltaY: 120, cancelable: true });
    expect(notPrevented).toBe(true);
  });

  it("still changes when the user actually picks something", () => {
    const select = renderSelect();
    fireEvent.change(select, { target: { value: "pcs" } });
    expect(select.value).toBe("pcs");
  });
});

describe("ErrorSummary renders a refusal that has no field errors", () => {
  /**
   * It used to bail on an empty list. That meant a refusal carrying only a
   * summary — a repeated চালান number, a rule the person cannot override —
   * displayed *nothing at all*, because the dialog never opened and the banner
   * returned null. The title is the message in that case.
   */
  it("shows the title with an empty error list", () => {
    render(<ErrorSummary title="এই চালান নম্বর আগে ব্যবহার হয়েছে" errors={[]} />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "এই চালান নম্বর আগে ব্যবহার হয়েছে",
    );
  });

  it("renders nothing only when there is genuinely nothing to say", () => {
    const { container } = render(<ErrorSummary title="   " errors={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("links an error to its field, and states one that has no field", () => {
    render(
      <>
        <Field fieldId="partyId">
          <FieldLabel>পক্ষ</FieldLabel>
          <Select>
            <option value="">—</option>
          </Select>
        </Field>
        <ErrorSummary
          title="ঠিক করুন"
          errors={[
            { fieldId: "partyId", message: "পক্ষ নির্বাচন করুন" },
            // No such box on screen: a complaint about the list itself.
            { fieldId: "lines", message: "অন্তত একটি পণ্য যোগ করুন" },
          ]}
        />
      </>,
    );

    // The one with a box is a link you can jump to…
    expect(screen.getByRole("link", { name: "পক্ষ নির্বাচন করুন" })).toHaveAttribute(
      "href",
      "#partyId",
    );
    // …and the one without is plain text, because a link that goes nowhere is
    // worse than no link.
    expect(screen.queryByRole("link", { name: "অন্তত একটি পণ্য যোগ করুন" })).toBeNull();
    expect(screen.getByText("অন্তত একটি পণ্য যোগ করুন")).toBeTruthy();
  });

  it("takes focus once, not on every render", () => {
    // The bug this replaced: the caller rebuilds the error array inline on
    // every render, so an effect keyed on the array itself fired on every
    // keystroke and dragged focus back to the banner. Nobody could tab through
    // the fields they had just been told to fix.
    const errors = [{ fieldId: "partyId", message: "পক্ষ নির্বাচন করুন" }];
    const { rerender } = render(<ErrorSummary title="ঠিক করুন" errors={errors} />);

    const banner = screen.getByRole("alert");
    expect(document.activeElement).toBe(banner);

    const elsewhere = document.createElement("input");
    document.body.appendChild(elsewhere);
    elsewhere.focus();

    // Same errors, fresh array — exactly what the caller does on a keystroke.
    rerender(
      <ErrorSummary title="ঠিক করুন" errors={[{ ...errors[0]! }]} />,
    );

    expect(document.activeElement).toBe(elsewhere);
  });
});
