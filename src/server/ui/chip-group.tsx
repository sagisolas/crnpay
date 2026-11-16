interface ChipOption {
  value: string;
  label: string;
  detail: string;
  icon: string | null;
}

interface ChipGroupProps {
  name: string;
  legend: string;
  options: ChipOption[];
  selected: string | undefined;
}

export function ChipGroup({ name, legend, options, selected }: ChipGroupProps) {
  return (
    <fieldset class="field">
      <legend class="label">{legend}</legend>
      <div class="chips">
        {options.map((option) => (
          <label class="chip">
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={option.value === selected}
            />
            <span>
              {option.icon && <img src={option.icon} alt="" width="20" height="20" />}
              {option.label}
              <em>{option.detail}</em>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
