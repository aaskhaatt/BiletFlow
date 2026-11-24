def reject_nulls(model, required: tuple[str, ...]):
    """For PATCH bodies. Leaving a field out keeps its value and null clears it, but these fields must always
    have a value, so an explicit null is a mistake (422) rather than being silently ignored."""
    nulled = [field for field in required if field in model.model_fields_set and getattr(model, field) is None]
    if nulled:
        raise ValueError(f"can't be null: {', '.join(nulled)}")
    return model
